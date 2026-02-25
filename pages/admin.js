// pages/api/admin/logs.js
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAuth(req) {
  if (!process.env.ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD no configurada");
  const { password } = req.body || {};
  if (String(password || "") !== String(process.env.ADMIN_PASSWORD)) {
    const e = new Error("Contraseña incorrecta");
    e.status = 401;
    throw e;
  }
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "POST") {
      await requireAuth(req);
      const { action, dni } = req.body || {};

      if (action === "buscar") {
        let q = supabase.from("logs_accesos").select("*").order("fecha", { ascending: false }).limit(200);
        if (dni) q = q.eq("dni", String(dni));
        const { data, error } = await q;
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, logs: data || [] });
      }

      if (action === "borrar") {
        const { error } = await supabase.from("logs_accesos").delete().gt("dni", "");
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }

      if (action === "descargar") {
        let q = supabase.from("logs_accesos").select("dni,encontrado,fecha").order("fecha", { ascending: false }).limit(5000);
        if (dni) q = q.eq("dni", String(dni));
        const { data, error } = await q;
        if (error) return res.status(500).json({ error: error.message });

        const rows = (data || []);
        const csv = ["dni,encontrado,fecha"]
          .concat(rows.map((r) => `${r.dni},${r.encontrado ? 1 : 0},${new Date(r.fecha).toISOString()}`))
          .join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="logs_accesos.csv"`);
        return res.status(200).send(csv);
      }

      return res.status(400).json({ error: "Acción inválida" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
