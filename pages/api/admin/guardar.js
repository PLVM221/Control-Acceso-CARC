import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password, persons, mode } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!Array.isArray(persons) || persons.length === 0) {
    return res.status(400).json({ error: "Listado vacío" });
  }

  try {
    // Normalización mínima
    const cleaned = persons
      .map((p) => ({
        dni: String(p.dni || "").trim(),
        nombre: String(p.nombre || "").trim(),
        tipo_ingreso: (p.tipoIngreso ?? p.tipo_ingreso ?? "").toString().trim() || null,
        puerta_acceso: (p.puertaAcceso ?? p.puerta_acceso ?? "").toString().trim() || null,
        ubicacion: (p.ubicacion ?? "").toString().trim() || null,
        cuota: Number(p.cuota ?? 1) === 0 ? 0 : 1,
        updated_at: new Date().toISOString(),
      }))
      .filter((p) => p.dni.length > 0);

    // 🔥 Clave: upsert por dni (si está repetido, actualiza)
    const { error } = await supabase
      .from("personas")
      .upsert(cleaned, { onConflict: "dni" });

    if (error) throw error;

    return res.status(200).json({ ok: true, inserted: cleaned.length, mode });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo guardar", detail: e.message });
  }
}
