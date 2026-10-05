"use client";

import type { Cliente, ModulacionInput } from "@/lib/db/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  analyzeScreenshotWithOpenRouter,
  createModulacion,
  sendModulacionWhatsappBySV,
} from "./actions";
import { upsertClientes } from "../import/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Check, Bot, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Session } from "@supabase/supabase-js";

const DEFAULT_MOTIVOS = [
  "MAL FACTURADO",
  "Entrega",
  "Reprogramación",
  "Retira cliente",
  "Devolución",
  "Reclamo",
  "Otro",
] as const;

const DEFAULT_CHOFERES = ["Juan", "Pedro", "María", "Otro"] as const;

function formatWhatsappText(params: {
  cliente: Cliente;
  input: ModulacionInput;
}) {
  const now = new Date();
  const fecha = now.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    `*MODULACIÓN*`,
    `Fecha: ${fecha}`,
    ``,
    `Cliente: *${params.cliente.numero_cliente}*`,
    params.cliente.nombre ? `Nombre: ${params.cliente.nombre}` : null,
    ``,
    `Motivo: *${params.input.motivo}*`,
    `Chofer: *${params.input.chofer}*`,
    `Bultos: *${params.input.bultos}*`,
    `HL: *${params.input.hl}*`,
    params.input.comentario ? `Comentario: *${params.input.comentario}*` : null,
  ].filter((x): x is string => Boolean(x));

  return lines.join("\n");
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function bestMatchFromList(text: string, values: string[]) {
  const hay = normalizeForMatch(text);
  for (const v of values) {
    const n = normalizeForMatch(v);
    if (!n) continue;
    if (hay.includes(n)) return v;
  }
  return null;
}

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  const stars = Array.from({ length: 5 }, (_, i) => (i < v ? "★" : "☆")).join("");
  return (
    <span aria-label={`${v} de 5`} title={`${v} de 5`} className="text-yellow-500">
      {stars}
    </span>
  );
}

export function DashboardClient() {
  const env = useMemo(() => getSupabaseEnv(), []);
  const supabase = useMemo(() => {
    if (env.missing.length) return null;
    return createSupabaseBrowserClient();
  }, [env.missing.length]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Cliente[]>([]);
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [clientesCount, setClientesCount] = useState<number | null>(null);
  const [clientesCountError, setClientesCountError] = useState<string | null>(
    null,
  );
  const [motivos, setMotivos] = useState<string[]>([...DEFAULT_MOTIVOS]);
  const [choferes, setChoferes] = useState<string[]>([...DEFAULT_CHOFERES]);
  const [listasError, setListasError] = useState<string | null>(null);

  const [input, setInput] = useState<ModulacionInput>({
    motivo: DEFAULT_MOTIVOS[0],
    chofer: "",
    bultos: 1,
    hl: 0,
    comentario: "",
  });

  const [whatsappText, setWhatsappText] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);
  const [showChoferModal, setShowChoferModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showCreateClienteModal, setShowCreateClienteModal] = useState(false);
  const [newCliente, setNewCliente] = useState<{
    numero_cliente: string;
    nombre: string;
    sv: string;
    vendedor: string;
  }>({
    numero_cliente: "",
    nombre: "",
    sv: "",
    vendedor: "",
  });
  const [choferSearch, setChoferSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoSendStatus, setAutoSendStatus] = useState<
    | { type: "idle" }
    | { type: "sending" }
    | { type: "sent" }
    | { type: "warn"; message: string }
    | { type: "error"; message: string }
  >({ type: "idle" });
  const [scoresByNumero, setScoresByNumero] = useState<
    Record<string, Array<{ puntuacion: number; fecha: string; comentario: string | null }>>
  >({});

  const [ocrStatus, setOcrStatus] = useState<
    | { type: "idle" }
    | { type: "running"; progress: number }
    | { type: "error"; message: string }
  >({ type: "idle" });

  const [pendingStats, setPendingStats] = useState<{ count: number; maxMinutes: number }>({ count: 0, maxMinutes: 0 });
  const [showAiAviso, setShowAiAviso] = useState(true);

  const [lastSentInfo, setLastSentInfo] = useState<{
    cliente: string;
    sv: string | null;
    autoSendStatus: { type: "idle" | "sending" | "sent" | "warn" | "error"; message?: string };
    whatsappText: string;
  } | null>(null);

  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!supabase || !authChecked || !session) return;

    const fetchPending = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const startDate = `${today}T00:00:00.000Z`;
        const endDate = `${today}T23:59:59.999Z`;

        const { data, error } = await supabase
          .from("modulaciones")
          .select("created_at, actualizacion")
          .gte("created_at", startDate)
          .lte("created_at", endDate)
          .or("actualizacion.eq.pendiente,actualizacion.is.null");

        if (!error && data) {
          const now = Date.now();
          const pendingItems = data.filter(r => (r.actualizacion || "pendiente") === "pendiente");
          const count = pendingItems.length;
          let maxMinutes = 0;
          
          if (count > 0) {
            const oldest = Math.min(...pendingItems.map(r => new Date(r.created_at).getTime()));
            maxMinutes = Math.floor((now - oldest) / 60000);
          }
          
          setPendingStats({ count, maxMinutes });
        }
      } catch (err) {
        console.error("Error fetching pending stats:", err);
      }
    };

    void fetchPending();
    const interval = setInterval(fetchPending, 30000); // Actualizar cada 30 seg
    return () => clearInterval(interval);
  }, [supabase, authChecked, session]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace("/login");
      } else {
        setSession(data.session);
      }
      setAuthChecked(true);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !s)) {
        router.replace("/login");
      } else if (s) {
        setSession(s);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  const searchTimer = useRef<number | null>(null);

  const selectCliente = useCallback((c: Cliente) => {
    setSelected(c);
    setSubmitOk(false);
    setSubmitError(null);
    setWhatsappText("");
    setAutoSendStatus({ type: "idle" });
    setLastSentInfo(null);
  }, []);

  const resetForm = useCallback(() => {
    setSelected(null);
    setQuery("");
    setResults([]);
    setSubmitOk(false);
    setSubmitError(null);
    setWhatsappText("");
    setAutoSendStatus({ type: "idle" });
    setInput({
      motivo: motivos[0] || DEFAULT_MOTIVOS[0],
      chofer: "",
      bultos: 1,
      hl: 0,
      comentario: "",
    });
    setLastSentInfo(null);
  }, [motivos]);

  useEffect(() => {
    if (env.missing.length || !supabase || !authChecked || !session) return;

    let cancelled = false;
    void (async () => {
      setListasError(null);

      const [motivosRes, choferesRes] = await Promise.all([
        supabase.from("motivos").select("nombre").order("nombre"),
        supabase.from("choferes").select("nombre").order("nombre"),
      ]);

      if (cancelled) return;

      const errors: string[] = [];
      if (motivosRes.error) errors.push(`Motivos: ${motivosRes.error.message}`);
      if (choferesRes.error)
        errors.push(`Choferes: ${choferesRes.error.message}`);

      if (errors.length) {
        setListasError(errors.join(" | "));
        return;
      }

      const nextMotivos = (motivosRes.data ?? [])
        .map((r) => r.nombre)
        .filter((x): x is string => Boolean(x));
      const nextChoferes = (choferesRes.data ?? [])
        .map((r) => r.nombre)
        .filter((x): x is string => Boolean(x));

      if (nextMotivos.length) setMotivos(nextMotivos);
      if (nextChoferes.length) setChoferes(nextChoferes);
    })();

    return () => {
      cancelled = true;
    };
  }, [env.missing.length, supabase, authChecked, session]);

  useEffect(() => {
    if (!selected || env.missing.length || !supabase || !authChecked || !session)
      return;
    if (
      Object.prototype.hasOwnProperty.call(scoresByNumero, selected.numero_cliente)
    )
      return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("puntuaciones")
        .select("puntuacion,fecha,comentario")
        .eq("cliente_numero", selected.numero_cliente)
        .order("fecha", { ascending: false })
        .limit(3);
      if (cancelled) return;
      if (error || !data?.length) {
        setScoresByNumero((prev) => ({ ...prev, [selected.numero_cliente]: [] }));
        return;
      }
      const rows = data as Array<{
        puntuacion: number;
        fecha: string;
        comentario: string | null;
      }>;
      setScoresByNumero((prev) => ({
        ...prev,
        [selected.numero_cliente]: rows.map((r) => ({
          puntuacion: Number(r.puntuacion) || 0,
          fecha: r.fecha,
          comentario: r.comentario ?? null,
        })),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    env.missing.length,
    scoresByNumero,
    selected,
    supabase,
    authChecked,
    session,
  ]);

  useEffect(() => {
    if (env.missing.length || !supabase || !authChecked || !session) return;

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        setClientesCountError(null);

        const { error, count } = await supabase
          .from("clientes")
          .select("id", { count: "exact", head: true })
          .abortSignal(controller.signal);

        if (cancelled) return;
        if (error) {
          if (error.message.includes("abort")) return;
          setClientesCount(null);
          setClientesCountError(error.message);
          return;
        }
        setClientesCount(typeof count === "number" ? count : null);
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        console.error("Error fetching clientes count:", err);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [env.missing.length, supabase, authChecked, session]);

  useEffect(() => {
    if (env.missing.length || !supabase || !authChecked || !session) return;

    if (searchTimer.current) window.clearTimeout(searchTimer.current);

    const q = query.trim().replaceAll(",", " ");
    if (!q) {
      setResults([]);
      setLoadingResults(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    searchTimer.current = window.setTimeout(async () => {
      try {
        setLoadingResults(true);
        setSearchError(null);
        setSubmitOk(false);
        setSubmitError(null);
        setWhatsappText("");

        // Primero intentamos con msj_en_fra
        let data: any[] | null = null;
        let error: any = null;
        
        const { data: dataWithNewCols, error: errorWithNewCols } = await supabase
          .from("clientes")
          .select(
            "id,title,numero_cliente,nombre,domicilio,vendedor,sv,telefono,zona,msj_en_fra,pdv_critico_chofer,feedback_pdv",
          )
          .or(`numero_cliente.ilike.%${q}%,nombre.ilike.%${q}%`)
          .order("nombre", { ascending: true })
          .limit(12)
          .abortSignal(controller.signal);
        
        if (errorWithNewCols && errorWithNewCols.message && (
          errorWithNewCols.message.includes("msj_en_fra") ||
          errorWithNewCols.message.includes("pdv_critico_chofer") ||
          errorWithNewCols.message.includes("feedback_pdv") ||
          errorWithNewCols.message.includes("does not exist")
        )) {
          // Si falla por las nuevas columnas, volvemos a intentar sin ellas
          const { data: dataWithoutNewCols, error: errorWithoutNewCols } = await supabase
            .from("clientes")
            .select(
              "id,title,numero_cliente,nombre,domicilio,vendedor,sv,telefono,zona",
            )
            .or(`numero_cliente.ilike.%${q}%,nombre.ilike.%${q}%`)
            .order("nombre", { ascending: true })
            .limit(12)
            .abortSignal(controller.signal);
          
          if (errorWithoutNewCols) {
            error = errorWithoutNewCols;
          } else {
            // Agregamos las nuevas columnas como null a cada resultado
            data = (dataWithoutNewCols ?? []).map(item => ({
              ...item,
              msj_en_fra: null,
              pdv_critico_chofer: null,
              feedback_pdv: null
            }));
          }
        } else {
          data = dataWithNewCols;
          error = errorWithNewCols;
        }

        if (cancelled) return;

        if (error) {
          if (error.message.includes("abort")) return;
          setSearchError(error.message);
          setResults([]);
          setLoadingResults(false);
          return;
        }

        const nextResults = (data ?? []) as Cliente[];
        setResults(nextResults);
        if (!nextResults.length) setScoresByNumero({});

        const normalizedQuery = q.replaceAll(/\s+/g, "");
        const exact =
          nextResults.find(
            (c) =>
              c.numero_cliente.replaceAll(/\s+/g, "") === normalizedQuery ||
              c.numero_cliente === q,
          ) ?? null;

        if (exact) {
          setSelected(exact);
          setSubmitOk(false);
          setSubmitError(null);
          setWhatsappText("");
        } else if (nextResults.length === 1) {
          setSelected(nextResults[0]);
          setSubmitOk(false);
          setSubmitError(null);
          setWhatsappText("");
        } else if (nextResults.length === 0 && /^\d+$/.test(q)) {
          // No hay resultados y la búsqueda parece ser un número de cliente
          setNewCliente({
            numero_cliente: q,
            nombre: "",
            sv: "",
            vendedor: "",
          });
          setShowCreateClienteModal(true);
        }

        setLoadingResults(false);
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        console.error("Search error:", err);
        setLoadingResults(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [env.missing.length, query, supabase, authChecked, session]);

  useEffect(() => {
    if (env.missing.length || !supabase || !authChecked || !session) return;

    const numeros = Array.from(
      new Set(results.map((r) => r.numero_cliente).filter(Boolean)),
    );
    if (!numeros.length) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("puntuaciones")
        .select("cliente_numero,puntuacion,fecha,comentario")
        .in("cliente_numero", numeros)
        .order("fecha", { ascending: false });

      if (cancelled) return;
      if (error) {
        setScoresByNumero({});
        return;
      }

      const grouped: Record<
        string,
        Array<{ puntuacion: number; fecha: string; comentario: string | null }>
      > = {};
      for (const r of (data ?? []) as Array<{
        cliente_numero: string;
        puntuacion: number;
        fecha: string;
        comentario: string | null;
      }>) {
        const numero = String(r.cliente_numero ?? "").trim();
        if (!numero) continue;
        const list = grouped[numero] ?? (grouped[numero] = []);
        if (list.length >= 3) continue;
        list.push({
          puntuacion: Number(r.puntuacion) || 0,
          fecha: r.fecha,
          comentario: r.comentario ?? null,
        });
      }
      for (const numero of numeros) {
        if (!Object.prototype.hasOwnProperty.call(grouped, numero))
          grouped[numero] = [];
      }
      setScoresByNumero(grouped);
    })();

    return () => {
      cancelled = true;
    };
  }, [env.missing.length, results, supabase, authChecked, session]);

  const selectedScores = selected
    ? (scoresByNumero[selected.numero_cliente] ?? [])
    : [];
  const lastScore = selectedScores[0]
    ? { puntuacion: selectedScores[0].puntuacion, fecha: selectedScores[0].fecha }
    : null;

  async function onModular(overrideChofer?: string) {
    if (!selected) return;
    setSubmitOk(false);
    setSubmitError(null);
    setAutoSendStatus({ type: "idle" });

    const effectiveMotivo = input.motivo.trim();
    const effectiveChofer = (overrideChofer || input.chofer).trim();

    if (!effectiveMotivo || !effectiveChofer || !input.bultos) {
      setSubmitError("Completá Motivo, Chofer y Bultos.");
      return;
    }

    const effectiveInput: ModulacionInput = {
      ...input,
      motivo: effectiveMotivo,
      chofer: effectiveChofer,
    };
    const message = formatWhatsappText({ cliente: selected, input: effectiveInput });
    setWhatsappText(message);
    setInput(effectiveInput);

    startTransition(async () => {
      try {
        await createModulacion({
          clienteId: selected.id,
          clienteNumero: selected.numero_cliente,
          clienteNombre: selected.nombre ?? null,
          zona: selected.zona ?? null,
          vendedor: selected.vendedor ?? null,
          sv: selected.sv ?? null,
          motivo: effectiveMotivo,
          chofer: effectiveChofer,
          bultos: input.bultos,
          hl: input.hl,
          comentario: input.comentario,
        });
        setSubmitOk(true);
        setLastSentInfo({
          cliente: `${selected.numero_cliente} - ${selected.nombre || ""}`,
          sv: selected.sv || "No asignado",
          autoSendStatus: { type: "sending" },
          whatsappText: message,
        });

        setAutoSendStatus({ type: "sending" });
        try {
          const res = await sendModulacionWhatsappBySV({
            sv: selected.sv ?? null,
            message,
          });

          let newStatus: { 
            type: "idle" | "sending" | "sent" | "warn" | "error"; 
            message: string 
          } | { 
            type: "sent" 
          };
          
          if (res.status === "sent") {
            newStatus = { type: "sent" };
          } else if (res.status === "not_found") {
            newStatus = { type: "warn", message: "Supervisor no registrado en WhatsApp Admin" };
          } else if (res.status === "inactive") {
            newStatus = { type: "warn", message: "Grupo de WhatsApp inactivo" };
          } else if (res.status === "no_group_id") {
            newStatus = { type: "warn", message: "Supervisor registrado sin group_id (no se puede enviar automático)" };
          } else if (res.status === "missing_sv") {
            newStatus = { type: "warn", message: "Cliente sin SV" };
          } else if (res.status === "missing_table") {
            newStatus = { type: "warn", message: "Falta la tabla whatsapp_groups (no se pudo enviar automático)" };
          } else {
            newStatus = { type: "warn", message: "No se pudo enviar automático" };
          }

          setAutoSendStatus(newStatus);
          setLastSentInfo(prev => prev ? { ...prev, autoSendStatus: newStatus } : null);
        } catch (err) {
          const errStatus = {
            type: "error" as const,
            message: err instanceof Error ? err.message : "Error al enviar WhatsApp",
          };
          setAutoSendStatus(errStatus);
          setLastSentInfo(prev => prev ? { ...prev, autoSendStatus: errStatus } : null);
        }
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  async function onCopyAndSend() {
    if (!whatsappText) return;
    await navigator.clipboard.writeText(whatsappText);
    window.open(
      `https://web.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`,
      "_blank",
    );
  }

  const onOcrFile = useCallback(async (file: File) => {
    setOcrStatus({ type: "running", progress: 0 });
    try {
      // 1. Convertir imagen a Base64 para OpenRouter
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          resolve(res.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const imageBase64 = await base64Promise;

      // 2. Analizar con OpenRouter (IA)
      setOcrStatus({ type: "running", progress: 0.5 });
      const extracted = await analyzeScreenshotWithOpenRouter({
        imageBase64,
        motivos: motivos as unknown as string[],
        choferes: choferes as unknown as string[],
      });

      console.log("--- AI EXTRACTION START ---");
      console.log(extracted);
      console.log("--- AI EXTRACTION END ---");

      const found = extracted.numero_cliente?.toString();
      if (!found) {
        setOcrStatus({
          type: "error",
          message:
            "La IA no pudo detectar un número de cliente en la imagen. Probá con otra captura más nítida.",
        });
        return;
      }

      // 3. ACTUALIZAR INPUT INMEDIATAMENTE CON VALORES EXTRAÍDOS
      const aiChofer = extracted.chofer?.toString() || "";
      const matchedChofer = aiChofer ? (bestMatchFromList(aiChofer, choferes) || aiChofer) : "";

      const aiMotivo = extracted.motivo?.toString() || "";
      const matchedMotivo = aiMotivo ? (bestMatchFromList(aiMotivo, motivos) || aiMotivo) : input.motivo;

      const nextInput: ModulacionInput = {
        motivo: matchedMotivo,
        chofer: matchedChofer,
        bultos: typeof extracted.bultos === "number" ? extracted.bultos : (parseInt(extracted.bultos) || input.bultos),
        hl: typeof extracted.hl === "number" ? extracted.hl : (parseFloat(extracted.hl) || 0),
        comentario: extracted.comentario?.toString() || "",
      };
      
      console.log("Valores extraídos analizados por IA:", extracted);
      console.log("Valores procesados:", nextInput);
      
      // Forzar la actualización del estado del formulario
      setInput(nextInput);
      setQuery(found);
      setSubmitOk(false);
      setSubmitError(null);
      setAutoSendStatus({ type: "idle" });
      setChoferSearch(matchedChofer); // Sincronizar el buscador con el chofer detectado
      setShowValidationModal(true); 

      // 4. BUSCAR CLIENTE
      let cliente: Cliente | null = null;
      if (supabase) {
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
          const byEq = await supabase
            .from("clientes")
            .select("id,title,numero_cliente,nombre,domicilio,vendedor,sv,telefono,zona,pdv_critico_chofer,feedback_pdv")
            .eq("numero_cliente", found)
            .limit(1)
            .maybeSingle();
          if (!byEq.error && byEq.data) {
            cliente = byEq.data as Cliente;
          } else {
            const byLike = await supabase
              .from("clientes")
              .select("id,title,numero_cliente,nombre,domicilio,vendedor,sv,telefono,zona,pdv_critico_chofer,feedback_pdv")
              .ilike("numero_cliente", `%${found}%`)
              .order("nombre", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!byLike.error && byLike.data) {
              cliente = byLike.data as Cliente;
            } else {
              // CLIENTE NO ENCONTRADO - Mostrar modal de creación
              setOcrStatus({ type: "idle" });
              setNewCliente({
                numero_cliente: found,
                nombre: extracted.cliente_nombre || "",
                sv: extracted.sv || "",
                vendedor: "",
              });
              setShowCreateClienteModal(true);
              return;
            }
          }
        }
      }

      const clienteForMsg: Cliente = cliente ?? {
        id: "captura",
        title: null,
        numero_cliente: found,
        nombre: extracted.cliente ?? null,
        domicilio: null,
        vendedor: null,
        sv: null,
        telefono: null,
        zona: null,
        msj_en_fra: null,
        pdv_critico_chofer: null,
        feedback_pdv: null,
      };

      if (cliente) {
        selectCliente(cliente);
      } else {
        setSelected(clienteForMsg);
      }

      const clienteWithSv: Cliente = {
        ...clienteForMsg,
        sv: extracted.sv ?? clienteForMsg.sv,
      };

      // 3. GENERAR MENSAJE USANDO LOS VALORES RECIÉN EXTRAÍDOS (nextInput)
      const message = formatWhatsappText({ 
        cliente: clienteWithSv, 
        input: nextInput 
      });
      setWhatsappText(message);

      // 4. SOLO MOSTRAR PARA REVISIÓN (No guardar automáticamente)
      if (!cliente) {
        setSubmitError("Cliente no encontrado en la base de datos. Verificá el número.");
      } else {
        setSubmitError(null);
        setSubmitOk(false);
      }

      setOcrStatus({ type: "idle" });
    } catch (e) {
      setOcrStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error de OCR",
      });
    }
  }, [choferes, input, motivos, selectCliente, supabase]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (!file.type.startsWith("image/")) continue;
        void onOcrFile(file);
        return;
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onOcrFile]);

  if (env.missing.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-lg font-semibold">Configurar Supabase</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Faltan variables de entorno: {env.missing.join(", ")}
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Verificando sesión...
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Aviso de la IA (Robot) */}
      {showAiAviso && pendingStats.count > 0 && (
        <div className="relative flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3 pr-10 shadow-sm dark:border-red-800 dark:bg-red-900/20 animate-in slide-in-from-top duration-300">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-800">
            <Bot className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-100">
              ¡Hola! Tenés <span className="font-bold">{pendingStats.count}</span> {pendingStats.count === 1 ? 'pendiente' : 'pendientes'} y el más antiguo lleva <span className="font-bold">{pendingStats.maxMinutes}</span> {pendingStats.maxMinutes === 1 ? 'minuto' : 'minutos'}.
            </p>
          </div>
          <button
            onClick={() => setShowAiAviso(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-800"
            title="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Buscador de clientes</div>
            <div className="text-sm text-muted-foreground">
              Buscá por Nº de cliente o nombre.
            </div>
            {clientesCountError ? (
              <div className="mt-2 text-xs text-muted-foreground">
                No pude leer la tabla clientes: {clientesCountError}
              </div>
            ) : clientesCount !== null ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Clientes cargados: {clientesCount}
              </div>
            ) : null}

            {listasError ? (
              <div className="mt-2 text-xs text-muted-foreground">
                No pude cargar Choferes/Motivos: {listasError}. Podés cargarlos en{" "}
                <Link href="/listas" className="underline">
                  Choferes/Motivos
                </Link>
                .
              </div>
            ) : null}
          </div>
          <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onOcrFile(file);
                e.currentTarget.value = "";
              }}
            />
            <span>Subir / Pegar captura</span>
          </label>
        </div>
        <div className="mt-2 text-sm font-semibold text-green-600">
          PEGAR CAPTURA PARA MODULAR CON LA IA
        </div>

        {ocrStatus.type === "running" ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Leyendo imagen... {Math.round(ocrStatus.progress * 100)}%
          </div>
        ) : ocrStatus.type === "error" ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {ocrStatus.message}
          </div>
        ) : null}

        <div className="mt-4">
          <input
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              if (!next.trim()) {
                if (searchTimer.current)
                  window.clearTimeout(searchTimer.current);
                setResults([]);
                setSearchError(null);
                setLoadingResults(false);
                setSelected(null);
                setSubmitOk(false);
                setSubmitError(null);
                setWhatsappText("");
                setScoresByNumero({});
              }
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ej: 12345 o nombre del cliente"
          />
          <div className="mt-2 text-xs text-muted-foreground">
            {loadingResults ? "Buscando..." : "\u00A0"}
          </div>
        </div>

        {searchError ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {searchError}
          </div>
        ) : null}

        {!searchError && clientesCount === 0 ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            No hay clientes cargados. Importalos desde{" "}
            <Link href="/import" className="underline">
              Importar clientes
            </Link>
            .
          </div>
        ) : null}

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {results.length ? (
            results.map((c) => {
              const scores = scoresByNumero[c.numero_cliente] ?? [];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    selectCliente(c);
                  }}
                  className="flex w-full items-start justify-between gap-3 bg-card px-3 py-3 text-left hover:bg-muted"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {c.numero_cliente} {c.nombre ? `- ${c.nombre}` : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.domicilio ?? "—"}
                    </div>
                    {c.msj_en_fra ? (
                      <div className="truncate text-xs font-bold text-red-600 dark:text-red-400">
                        MSJ en FRA: {c.msj_en_fra}
                      </div>
                    ) : null}
                    {c.pdv_critico_chofer ? (
                      <div className="truncate text-xs font-bold text-orange-600 dark:text-orange-400">
                        PDV Crítico Chofer: {c.pdv_critico_chofer}
                      </div>
                    ) : null}
                    {c.feedback_pdv ? (
                      <div className="truncate text-xs font-bold text-green-600 dark:text-green-400">
                        Feedback PDV: {c.feedback_pdv}
                      </div>
                    ) : null}
                    {scores.length ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-card-foreground">
                          Últimas 3:
                        </span>
                        {scores.map((s, idx) => (
                          <span
                            key={`${c.numero_cliente}-${s.fecha}-${idx}`}
                            className="inline-flex items-center gap-1"
                          >
                            <Stars value={s.puntuacion} />
                            <span>
                              {new Date(s.fecha).toLocaleDateString("es-AR", { timeZone: "UTC" })}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {c.zona ?? "—"}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {query.trim()
                ? "Sin resultados."
                : "Escribí para ver resultados en tiempo real."}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold">Modulación</div>
        <div className="text-sm text-muted-foreground">
          Seleccioná un cliente y cargá la modulación.
        </div>

        {lastSentInfo ? (
          <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/5 p-6 text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-green-700 dark:text-green-400">
              ¡Modulación Enviada!
            </h3>

            {lastSentInfo.autoSendStatus.type === "sent" ? (
              <div className="mt-2 text-sm text-green-600 dark:text-green-400 font-medium">
                Resumen enviado automáticamente por WhatsApp.
              </div>
            ) : (
              <div className="mt-4 rounded-md bg-amber-100 dark:bg-amber-900/30 p-4 text-left border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  Atención: Envío manual requerido
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-500 mb-3">
                  {lastSentInfo.autoSendStatus.message || "El supervisor no está registrado en el sistema de envío automático."}
                </p>
                <div className="relative group rounded-md bg-background/50 p-2 text-[10px] font-mono text-muted-foreground mb-3 max-h-32 overflow-y-auto border border-amber-200/50">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(lastSentInfo.whatsappText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="absolute right-2 top-2 p-1.5 rounded-md bg-background border border-border shadow-sm hover:bg-muted transition-all active:scale-90 z-10"
                    title="Copiar resumen"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <pre className="whitespace-pre-wrap">{lastSentInfo.whatsappText}</pre>
                </div>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(lastSentInfo.whatsappText);
                    window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(lastSentInfo.whatsappText)}`, "_blank");
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-all active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                  </svg>
                  Copiar y Enviar Manual
                </button>
              </div>
            )}

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">{lastSentInfo.cliente}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">Supervisor (SV):</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {lastSentInfo.sv}
                </span>
              </div>
            </div>
            <button
              onClick={resetForm}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 shadow-sm transition-all active:scale-95"
            >
              Nueva modulación
            </button>
          </div>
        ) : !selected ? (
          <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
            No hay cliente seleccionado.
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold">
                {selected.numero_cliente}{" "}
                {selected.nombre ? `- ${selected.nombre}` : ""}
              </div>
              <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                <div>Domicilio: {selected.domicilio ?? "—"}</div>
                <div>Teléfono: {selected.telefono ?? "—"}</div>
                <div>Zona: {selected.zona ?? "—"}</div>
                <div>Vendedor: {selected.vendedor ?? "—"}</div>
                <div>SV: {selected.sv ?? "—"}</div>
                {selected.msj_en_fra ? (
                  <div className="font-bold text-red-600 dark:text-red-400">MSJ en FRA: {selected.msj_en_fra}</div>
                ) : null}
                {selected.pdv_critico_chofer ? (
                  <div className="font-bold text-orange-600 dark:text-orange-400">PDV Crítico Chofer: {selected.pdv_critico_chofer}</div>
                ) : null}
                {selected.feedback_pdv ? (
                  <div className="font-bold text-green-600 dark:text-green-400">Feedback PDV: {selected.feedback_pdv}</div>
                ) : null}
                <div className="flex items-center gap-2">
                  Puntuación:{" "}
                  {lastScore ? (
                    <>
                      <Stars value={lastScore.puntuacion} />{" "}
                      <span>
                        {new Date(lastScore.fecha).toLocaleDateString("es-AR", { timeZone: "UTC" })}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                {selectedScores.length ? (
                  <div className="mt-1">
                    <div className="text-xs font-semibold text-card-foreground">
                      Últimas 3
                    </div>
                    <div className="mt-1 grid grid-cols-1 gap-1">
                      {selectedScores.map((s, idx) => (
                        <div
                          key={`${s.fecha}-${idx}`}
                          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                        >
                          <Stars value={s.puntuacion} />
                          <span>{new Date(s.fecha).toLocaleDateString("es-AR")}</span>
                          {s.comentario ? <span>- {s.comentario}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-medium text-card-foreground">
                    Motivo
                  </div>
                  <select
                    value={input.motivo}
                    onChange={(e) =>
                      setInput((prev) => ({ ...prev, motivo: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {!motivos.includes(input.motivo) ? (
                      <option key={input.motivo} value={input.motivo}>
                        {input.motivo}
                      </option>
                    ) : null}
                    {motivos.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium text-card-foreground">
                    Chofer
                  </div>
                  <select
                    value={input.chofer}
                    onChange={(e) =>
                      setInput((prev) => ({ ...prev, chofer: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {!choferes.includes(input.chofer) ? (
                      <option key={input.chofer} value={input.chofer}>
                        {input.chofer}
                      </option>
                    ) : null}
                    {choferes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-medium text-card-foreground">
                    Bultos
                  </div>
                  <input
                    value={String(input.bultos)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setInput((prev) => ({
                        ...prev,
                        bultos: Number.isFinite(next) ? next : prev.bultos,
                      }));
                    }}
                    type="number"
                    step="0.01"
                    min={0}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium text-card-foreground">
                    HL (Hectólitros)
                  </div>
                  <input
                    value={String(input.hl)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setInput((prev) => ({
                        ...prev,
                        hl: Number.isFinite(next) ? next : prev.hl,
                      }));
                    }}
                    type="number"
                    step="0.01"
                    min={0}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-card-foreground">
                  Comentario
                </div>
                <textarea
                  value={input.comentario}
                  onChange={(e) =>
                    setInput((prev) => ({
                      ...prev,
                      comentario: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Detalles adicionales..."
                />
              </div>

              {submitError ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {submitError}
                </div>
              ) : null}

              {submitOk ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Guardado en Modulaciones.
                </div>
              ) : null}
              {autoSendStatus.type === "sending" ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Enviando WhatsApp automático...
                </div>
              ) : autoSendStatus.type === "sent" ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Enviado a WhatsApp.
                </div>
              ) : autoSendStatus.type === "warn" ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {autoSendStatus.message}. Podés copiar y enviar manualmente.
                </div>
              ) : autoSendStatus.type === "error" ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {autoSendStatus.message}. Podés copiar y enviar manualmente.
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void onModular()}
                  disabled={isPending || ocrStatus.type === "running"}
                  className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
                >
                  {isPending
                    ? "Guardando..."
                    : ocrStatus.type === "running"
                      ? "Procesando captura..."
                      : "Modular"}
                </button>

                <button
                  type="button"
                  onClick={onCopyAndSend}
                  disabled={!whatsappText}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground shadow-sm hover:bg-muted disabled:opacity-60"
                >
                  Copiar y Enviar
                </button>
              </div>

              {whatsappText ? (
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-2 text-sm font-semibold">
                    Resumen WhatsApp
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {whatsappText}
                  </pre>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl border border-border">
            <div className="mb-4">
              <h3 className="text-lg font-bold">Validar Datos de Captura</h3>
              <p className="text-sm text-muted-foreground">
                Revisá y corregí los datos extraídos antes de modular.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">Motivo</label>
                <select
                  value={input.motivo}
                  onChange={(e) => setInput(prev => ({ ...prev, motivo: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {motivos.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">Chofer</label>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Buscar o escribir chofer..."
                    value={choferSearch}
                    onChange={(e) => setChoferSearch(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30">
                    <div className="divide-y divide-border">
                      {choferes
                        .filter(c => normalizeForMatch(c).includes(normalizeForMatch(choferSearch)))
                        .map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setInput((prev) => ({ ...prev, chofer: c }));
                            setChoferSearch(c);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors ${input.chofer === c ? 'bg-muted font-bold' : ''}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">Bultos</label>
                  <input
                    type="number"
                    value={input.bultos}
                    onChange={(e) => setInput(prev => ({ ...prev, bultos: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">HL (Hectólitros)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={input.hl}
                    onChange={(e) => setInput(prev => ({ ...prev, hl: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">Comentario</label>
                <textarea
                  value={input.comentario}
                  onChange={(e) => setInput(prev => ({ ...prev, comentario: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Añadir comentario..."
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowValidationModal(false);
                  setChoferSearch("");
                }}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!input.chofer) {
                    alert("Por favor selecciona un chofer");
                    return;
                  }
                  setShowValidationModal(false);
                  setChoferSearch("");
                  void onModular();
                }}
                disabled={!input.chofer}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
              >
                Confirmar y Modular
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateClienteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl border border-border">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-amber-600 dark:text-amber-400">Cliente no registrado</h3>
              <p className="text-sm text-muted-foreground">
                El cliente <strong>{newCliente.numero_cliente}</strong> no está en la base. Completá los datos para agregarlo.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Cliente (ID)</label>
                  <input
                    type="text"
                    disabled
                    value={newCliente.numero_cliente}
                    className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newCliente.nombre}
                    onChange={(e) => setNewCliente(prev => ({ ...prev, nombre: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Nombre del cliente..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">SV (Supervisor)</label>
                  <input
                    type="text"
                    value={newCliente.sv}
                    onChange={(e) => setNewCliente(prev => ({ ...prev, sv: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Nombre del SV..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Vendedor</label>
                  <input
                    type="text"
                    value={newCliente.vendedor}
                    onChange={(e) => setNewCliente(prev => ({ ...prev, vendedor: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Nombre del vendedor..."
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateClienteModal(false);
                  setOcrStatus({ type: "idle" });
                }}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!newCliente.nombre || !newCliente.sv) {
                    alert("Por favor completá Nombre y SV.");
                    return;
                  }
                  startTransition(async () => {
                    try {
                      await upsertClientes({
                        rows: [{
                          numero_cliente: newCliente.numero_cliente,
                          nombre: newCliente.nombre,
                          sv: newCliente.sv,
                          vendedor: newCliente.vendedor,
                        }]
                      });
                      
                      // Buscar el cliente recién creado para continuar el flujo
                      const { data: created } = await supabase!
                        .from("clientes")
                        .select("*")
                        .eq("numero_cliente", newCliente.numero_cliente)
                        .single();
                      
                      if (created) {
                        selectCliente(created as Cliente);
                        setShowCreateClienteModal(false);
                        setShowValidationModal(true);
                        // Mensaje de éxito efímero
                        setSubmitOk(true);
                        setTimeout(() => setSubmitOk(false), 3000);
                      }
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Error al guardar cliente");
                    }
                  });
                }}
                disabled={isPending || !newCliente.nombre || !newCliente.sv}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
              >
                {isPending ? "Guardando..." : "Guardar y Continuar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChoferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-border">
            <div className="mb-4">
              <h3 className="text-lg font-bold">Validar Chofer</h3>
              <p className="text-sm text-muted-foreground">
                Buscá y seleccioná el chofer para enviar el resumen.
              </p>
            </div>

            <div className="mb-4">
              <input
                autoFocus
                type="text"
                placeholder="Buscar chofer..."
                value={choferSearch}
                onChange={(e) => setChoferSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-muted/30">
              <div className="divide-y divide-border">
                {choferes
                  .filter(c => normalizeForMatch(c).includes(normalizeForMatch(choferSearch)))
                  .map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setInput((prev) => ({ ...prev, chofer: c }));
                      setShowChoferModal(false);
                      setChoferSearch("");
                      void onModular(c); // Enviar automáticamente
                    }}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors"
                  >
                    {c}
                  </button>
                ))}
                {choferes.filter(c => normalizeForMatch(c).includes(normalizeForMatch(choferSearch))).length === 0 && (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No se encontraron choferes.
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowChoferModal(false);
                  setChoferSearch("");
                }}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  </div>
);
}
