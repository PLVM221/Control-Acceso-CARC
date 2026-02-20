// pages/api/admin/guardar.js
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizarDNI(valor) {
  return String(valor ?? "")
    .replace(/[^\d]/g, "")   // deja solo dígitos
    .trim();
}

function dedupePorDNI(personas) {
  const map = new Map();
  for (const p of personas || []) {
    const dni = normalizarDNI(p?.dni);
    if (!dni) continue;

    map.set(dni, {
      dni,
      nombre: String(p?.nombre ?? "").trim(),
      tipo_ingreso: String(p?.tipoIngreso ?? p?.tipo_ingreso ?? "").trim(),
      puerta_acceso: String(p?.puertaAcceso ?? p?.puerta_acceso ?? "").trim(),
      ubicacion: String(p?.ubicacion ?? "").trim(),
      cuota: Number(p?.cuota ?? 1) === 0 ? 0 : 1,
      updated_at: new Date().toISOString(),
    });
  }
  return Array.from(map.values());
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { adminPassword, modo, personas } = req.body || {};

    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Falta ADMIN_PASSWORD en Vercel" });
    }
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Clave admin incorrecta" });
    }

    const deduped = dedupePorDNI(personas);
    if (!deduped.length) return res.status(400).json({ error: "No hay datos válidos para guardar" });

    if (modo === "NUEVO") {
      const { error: delErr } = await supabaseAdmin.from("personas").delete().neq("dni", "");
      if (delErr) return res.status(500).json({ error: delErr.message });
    }

    const { error: upErr } = await supabaseAdmin
      .from("personas")
      .upsert(deduped, { onConflict: "dni" });

    if (upErr) return res.status(500).json({ error: upErr.message });

    return res.status(200).json({
      ok: true,
      recibidas: personas?.length ?? 0,
      guardadas: deduped.length,
      duplicadas: (personas?.length ?? 0) - deduped.length,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error inesperado" });
  }
}
