import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const dni = normalizeDni(req.query.dni || "");
    const desde = req.query.desde || "";
    const hasta = req.query.hasta || "";
    const limit = Math.min(Number(req.query.limit || 80), 500);

    let query = supabase
      .from("logs_busqueda")
      .select("id, ts, dni_buscado, encontrado, nombre, tipo_ingreso, ubicacion, cuota, estado, partido")
      .order("ts", { ascending: false })
      .limit(limit);

    if (dni) {
      query = query.eq("dni_buscado", dni);
    }

    if (desde) {
      query = query.gte("ts", desde);
    }

    if (hasta) {
      query = query.lte("ts", hasta);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({
        error: "No se pudieron leer logs",
        detail: error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      logs: data || [],
    });
  } catch (e) {
    return res.status(500).json({
      error: "Error interno",
      detail: e.message || String(e),
    });
  }
}
