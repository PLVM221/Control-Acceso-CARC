import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function checkPassword(body) {
  const password = body?.password || "";
  return password === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("partidos_config")
        .select("*")
        .order("log_desde", { ascending: false });

      if (error) {
        return res.status(500).json({
          error: "No se pudieron leer partidos",
          detail: error.message,
        });
      }

      return res.status(200).json({
        ok: true,
        partidos: data || [],
      });
    }

    if (req.method === "POST") {
      if (!checkPassword(req.body)) {
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }

      const { rival, fecha_hora_partido, log_desde, log_hasta, activo = true } = req.body || {};

      if (!rival || !log_desde || !log_hasta) {
        return res.status(400).json({
          error: "Faltan datos del partido",
        });
      }

      const { data, error } = await supabase
        .from("partidos_config")
        .insert({
          rival: String(rival).trim(),
          fecha_hora_partido: fecha_hora_partido || null,
          log_desde,
          log_hasta,
          activo: !!activo,
        })
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({
          error: "No se pudo guardar el partido",
          detail: error.message,
        });
      }

      return res.status(200).json({
        ok: true,
        partido: data,
      });
    }

    if (req.method === "DELETE") {
      if (!checkPassword(req.body)) {
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }

      const { id } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: "Falta id del partido" });
      }

      const { error } = await supabase
        .from("partidos_config")
        .delete()
        .eq("id", id);

      if (error) {
        return res.status(500).json({
          error: "No se pudo borrar el partido",
          detail: error.message,
        });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    return res.status(500).json({
      error: "Error interno",
      detail: e.message || String(e),
    });
  }
}
