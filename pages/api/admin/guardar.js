import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { mode, persons } = req.body;

  if (!Array.isArray(persons) || persons.length === 0) {
    return res.status(400).json({ error: "Listado vacío" });
  }

  try {
    // Si es NUEVO → borra todo primero
    if (mode === "NUEVO") {
      await supabase.from("personas").delete().neq("dni", "");
    }

    // Guardar en bloques para no romper límite
    const CHUNK = 1000;

    for (let i = 0; i < persons.length; i += CHUNK) {
      const block = persons.slice(i, i + CHUNK);

      const { error } = await supabase
        .from("personas")
        .upsert(block, { onConflict: "dni" });

      if (error) throw error;
    }

    return res.json({ ok: true, total: persons.length });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error al guardar datos" });
  }
}
