import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    let { dni } = req.query;

    if (!dni) return res.status(400).json({ found: false });

    dni = String(dni).trim(); // NORMALIZAR

    const { data, error } = await supabase
      .from("personas")
      .select("*")
      .eq("dni", dni)
      .single();

    // Log de búsqueda
    await supabase.from("logs_accesos").insert({
      dni,
      encontrado: !!data
    });

    if (!data || error) {
      return res.json({ found: false });
    }

    res.json({ found: true, persona: data });

  } catch (err) {
    console.error(err);
    res.json({ found: false });
  }
}
