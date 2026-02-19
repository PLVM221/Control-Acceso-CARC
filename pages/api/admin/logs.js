import { supabaseAdmin } from "../../../lib/supabaseAdmin";

function isAuth(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  return !!token;
}

function toCsv(rows) {
  const header = ["ts","dni_buscado","encontrado","nombre","tipo_ingreso","puerta_acceso","ubicacion","cuota"];
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [
    header.join(","),
    ...rows.map(r => header.map(h => esc(r[h])).join(","))
  ];
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (!isAuth(req)) return res.status(401).json({ ok: false, error: "No autorizado" });

  const { from, to, download } = req.query;
  // from/to: "YYYY-MM-DD"
  let q = supabaseAdmin
    .from("logs_busqueda")
    .select("ts,dni_buscado,encontrado,nombre,tipo_ingreso,puerta_acceso,ubicacion,cuota")
    .order("ts", { ascending: false })
    .limit(2000);

  if (from) q = q.gte("ts", `${from}T00:00:00.000Z`);
  if (to) q = q.lte("ts", `${to}T23:59:59.999Z`);

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: "Error BD" });

  if (download === "1") {
    const csv = toCsv(data || []);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="logs_${from || "all"}_${to || "all"}.csv"`);
    return res.status(200).send(csv);
  }

  return res.status(200).json({ ok: true, logs: data || [] });
}
