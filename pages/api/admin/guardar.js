// pages/api/admin/guardar.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function normalizeDni(dni) {
  return String(dni ?? "").replace(/[^\d]/g, "").trim();
}

function normalizeCuota(val) {
  // acepta 1/0, "1"/"0", true/false
  if (val === 0 || val === "0" || val === false || val === "false") return 0;
  return 1;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { mode, persons, password } = req.body || {};

    // Password (simple)
    if (process.env.ADMIN_PASSWORD && password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "No autorizado" });
    }

    if (!Array.isArray(persons) || persons.length === 0) {
      return res.status(400).json({ error: "Listado vacío" });
    }

    const supabase = getSupabaseAdmin();

    // Normalizo y filtro
    const cleaned = persons
      .map((p) => ({
        dni: normalizeDni(p.dni),
        nombre: String(p.nombre ?? "").trim(),
        tipo_ingreso: String(p.tipoIngreso ?? p.tipo_ingreso ?? "").trim() || null,
        puerta_acceso: String(p.puertaAcceso ?? p.puerta_acceso ?? "").trim() || null,
        ubicacion: String(p.ubicacion ?? "").trim() || null,
        cuota: normalizeCuota(p.cuota),
        updated_at: new Date().toISOString(),
      }))
      .filter((p) => p.dni && p.nombre);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "No hay registros válidos (dni/nombre)" });
    }

    // NUEVO: borra todo antes
    if (mode === "NUEVO") {
      const del = await supabase.from("personas").delete().neq("dni", "");
      if (del.error) {
        return res.status(500).json({ error: "No se pudo borrar (NUEVO)", detail: del.error.message });
      }
    }

    // Upsert por DNI, por chunks (para 40k filas)
    const BATCH = 1000;
    const batches = chunk(cleaned, BATCH);

    let upserted = 0;
    for (const b of batches) {
      const r = await supabase
        .from("personas")
        .upsert(b, { onConflict: "dni" }); // si hay duplicados, pisa el último

      if (r.error) {
        return res.status(500).json({
          error: "No se pudo guardar",
          detail: r.error.message,
        });
      }
      upserted += b.length;
    }

    return res.status(200).json({
      ok: true,
      mode,
      received: persons.length,
      saved: upserted,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: e?.message || String(e) });
  }
}
