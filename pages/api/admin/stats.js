import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const [
      personasCount,
      fuentesCount,
      cuotaDiaCount,
      deudaCount,
      abonadosCount,
      ventaCount,
      listadoCount,
      ultimaPersona,
    ] = await Promise.all([
      supabase.from("personas").select("*", { count: "exact", head: true }),
      supabase.from("persona_fuentes").select("*", { count: "exact", head: true }),
      supabase.from("personas").select("*", { count: "exact", head: true }).eq("cuota", 1),
      supabase.from("personas").select("*", { count: "exact", head: true }).eq("cuota", 0),
      supabase.from("persona_fuentes").select("*", { count: "exact", head: true }).eq("abonado", true),
      supabase.from("persona_fuentes").select("*", { count: "exact", head: true }).eq("venta", true),
      supabase.from("persona_fuentes").select("*", { count: "exact", head: true }).eq("listado", true),
      supabase.from("personas").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return res.status(200).json({
      ok: true,
      stats: {
        personas: personasCount.count || 0,
        fuentes: fuentesCount.count || 0,
        cuotaDia: cuotaDiaCount.count || 0,
        deuda: deudaCount.count || 0,
        abonados: abonadosCount.count || 0,
        venta: ventaCount.count || 0,
        listado: listadoCount.count || 0,
        ultimaActualizacion: ultimaPersona.data?.updated_at || null,
      },
    });
  } catch (e) {
    return res.status(500).json({
      error: "No se pudieron obtener estadísticas",
      detail: e.message || String(e),
    });
  }
}
