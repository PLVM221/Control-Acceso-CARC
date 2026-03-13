import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const dni = normalizeDni(req.query.dni || "");
    const desde = req.query.desde || "";
    const hasta = req.query.hasta || "";

    let query = supabase
      .from("logs_busqueda")
      .select("ts, dni_buscado, encontrado, nombre, tipo_ingreso, ubicacion, cuota, estado, partido")
      .order("ts", { ascending: false })
      .limit(5000);

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
        error: "No se pudieron exportar logs",
        detail: error.message,
      });
    }

    const rows = [
      ["fecha", "dni", "encontrado", "nombre", "tipo_ingreso", "ubicacion", "cuota", "estado", "partido"],
      ...(data || []).map((r) => [
        r.ts || "",
        r.dni_buscado || "",
        r.encontrado ? "1" : "0",
        r.nombre || "",
        r.tipo_ingreso || "",
        r.ubicacion || "",
        r.cuota ?? "",
        r.estado || "",
        r.partido || "",
      ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="logs_control_acceso.csv"`);

    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({
      error: "Error interno",
      detail: e.message || String(e),
    });
  }
}
