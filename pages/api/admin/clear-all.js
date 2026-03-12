import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { password } = req.body || {};

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    const { error: errFuentes } = await supabase
      .from("persona_fuentes")
      .delete()
      .gt("dni", "");

    if (errFuentes) {
      return res.status(500).json({
        error: "No se pudo borrar persona_fuentes",
        detail: errFuentes.message,
      });
    }

    const { error: errPersonas } = await supabase
      .from("personas")
      .delete()
      .gt("dni", "");

    if (errPersonas) {
      return res.status(500).json({
        error: "No se pudo borrar personas",
        detail: errPersonas.message,
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Base completa borrada",
    });
  } catch (e) {
    return res.status(500).json({
      error: "Error interno",
      detail: e.message || String(e),
    });
  }
}
