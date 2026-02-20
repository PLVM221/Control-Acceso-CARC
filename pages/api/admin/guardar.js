// pages/api/admin/guardar.js
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// ✅ Permite bodies grandes (CSV -> JSON grande)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

function cleanText(v) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método no permitido" });
    }

    const { password, mode, persons } = req.body ?? {};

    // ✅ Password del admin por env var
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Falta ADMIN_PASSWORD en Vercel" });
    }
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Clave incorrecta" });
    }

    if (!Array.isArray(persons) || persons.length === 0) {
      return res.status(400).json({ error: "Listado vacío" });
    }

    // ✅ Normaliza + filtra + dedup por DNI (si hay repetidos, se queda con el último)
    const map = new Map();
    for (const p of persons) {
      const dni = normalizeDni(p?.dni);
      if (!dni) continue;

      map.set(dni, {
        dni,
        nombre: cleanText(p?.nombre),
        tipo_ingreso: cleanText(p?.tipoIngreso),
        puerta_acceso: cleanText(p?.puertaAcceso),
        ubicacion: cleanText(p?.ubicacion),
        cuota: Number(p?.cuota) === 0 ? 0 : 1, // default 1
        updated_at: new Date().toISOString(),
      });
    }

    const cleaned = Array.from(map.values());
    if (cleaned.length === 0) {
      return res.status(400).json({ error: "No hay filas válidas (sin DNI)" });
    }

    // ✅ Si es NUEVO: borra todo antes
    if (mode === "NUEVO") {
      const del = await supabaseAdmin.from("personas").delete().neq("dni", "");
      if (del.error) {
        return res.status(500).json({
          error: "No se pudo borrar para carga NUEVA",
          detail: del.error.message,
        });
      }
    }

    // ✅ Upsert en lotes para evitar timeouts
    const BATCH = 750; // podés bajar a 500 si sigue lento
    let ok = 0;

    for (let i = 0; i < cleaned.length; i += BATCH) {
      const chunk = cleaned.slice(i, i + BATCH);

      const up = await supabaseAdmin
        .from("personas")
        .upsert(chunk, { onConflict: "dni" });

      if (up.error) {
        return res.status(500).json({
          error: "No se pudo guardar (upsert)",
          detail: up.error.message,
          batch: `${i}-${i + chunk.length - 1}`,
        });
      }

      ok += chunk.length;
    }

    return res.status(200).json({
      ok: true,
      mode,
      recibidas: persons.length,
      validas: cleaned.length,
      guardadas: ok,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Error inesperado en guardar",
      detail: e?.message ?? String(e),
    });
  }
}
