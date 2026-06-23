import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // Verificación opcional de seguridad (si quieres agregar un token de autenticación)
  // const authHeader = request.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // }

  try {
    const supabase = createSupabaseAdminClient();

    // Obtener la fecha de hoy en formato ISO para filtrar (opcional: solo actualizar del día)
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    // Actualizar todas las modulaciones pendientes a entregado
    const { data, error, count } = await supabase
      .from("modulaciones")
      .update({
        actualizacion: "entregado",
        updated_at: new Date().toISOString(),
      })
      .eq("actualizacion", "pendiente")
      // Opcional: si quieres solo actualizar las del día de hoy
      // .gte("created_at", startOfDay)
      // .lte("created_at", endOfDay)
      .select("id, cliente_numero, cliente_nombre");

    if (error) {
      console.error("Error actualizando modulaciones:", error);
      return NextResponse.json(
        { error: "Error al actualizar las modulaciones", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Modulaciones actualizadas exitosamente`,
      actualizadas: data?.length || 0,
      modulaciones: data,
    });
  } catch (error) {
    console.error("Error en el cron:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
