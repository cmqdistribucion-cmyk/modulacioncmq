import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  try {
    // Verificar si la funcionalidad está activada
    const { data: settingsData } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["auto_status_enabled", "auto_status_hour"]);

    const config = (settingsData || []).reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);

    const enabled = config.auto_status_enabled === "true";
    const hour = parseInt(config.auto_status_hour || "21", 10);

    if (!enabled) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: "Funcionalidad desactivada",
      });
    }

    // Verificar si es la hora correcta (opcional, para seguridad adicional)
    const now = new Date();
    const currentHour = now.getHours();
    // Si no es la hora configurada, solo respondemos pero no ejecutamos
    // Esto es opcional, para que el cron job pueda llamar cada hora y solo se ejecute cuando toque
    if (currentHour !== hour) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: `No es la hora configurada (${hour}:00)`,
      });
    }

    // Obtener la fecha de hoy
    const today = new Date().toISOString().split("T")[0];
    const startDate = `${today}T00:00:00`;
    const endDate = `${today}T23:59:59`;

    // Obtener modulaciones pendientes
    const { data: modulaciones, error: selectError } = await supabase
      .from("modulaciones")
      .select("id")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .or("actualizacion.eq.pendiente,actualizacion.is.null");

    if (selectError) throw selectError;

    if (!modulaciones || modulaciones.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: "No hay modulaciones pendientes para actualizar",
      });
    }

    // Actualizar todas a entregado
    const { error: updateError } = await supabase
      .from("modulaciones")
      .update({
        actualizacion: "entregado",
        updated_at: new Date().toISOString(),
      })
      .in("id", modulaciones.map((m) => m.id));

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      updated: modulaciones.length,
      message: `Se actualizaron ${modulaciones.length} modulaciones a estado "entregado"`,
    });
  } catch (error) {
    console.error("Error en auto-status:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error al ejecutar cambio de estado",
      },
      { status: 500 }
    );
  }
}
