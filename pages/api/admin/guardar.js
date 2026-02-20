import { supabaseAdmin } from "../../../lib/supabaseAdmin";

function requireEnv() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.ADMIN_PASSWORD) missing.push("ADMIN_PASSWORD");
  return missing;
}

function normCuota(v) {
  // acepta: 1/0, "1"/"0", true/false, "si"/"no"
  if (v === 1 || v === "1" || v === true || String(v).toLowerCase() === "true") return 1;
  if (v === 0 || v === "0" || v === false || String(v).toLowerCase() === "false") return 0;
  const s = String(v ?? "").trim().toLowerCase();
  if (["si", "sí", "ok", "al dia", "aldia"].includes(s)) return 1;
  if (["no", "debe", "debe cuota", "debe_cuota"].includes(s)) return 0;
  return 1; // default
}

function sanitizeRow(r) {
  const dni = String(r.dni ?? "").trim();
  if (!dni) return null;

  return {
    dni,
    nombre: String(r.nombre ?? "").trim() || null,
    tipo_ingreso: String(r.tipoIngreso ?? r.tipo_ingreso ?? r.tipoIngreso ?? "").trim() || null,
    puerta_acceso: String(r.puertaAcceso ?? r.puerta_acceso ?? "").trim() || null,
    ubicacion: String(r.ubicacion ?? "").trim() || null,
    cuota: normCuota(r.cuota),
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const missing = requireEnv();
  if (missing.length) {
    return res.status(500).json({ ok: false, error: `Faltan env vars: ${missing.join(", ")}` });
  }

  const password = req.body?.password || req.headers["x-admin-password"];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }

  const modo = (req.body?.modo || "AGREGAR").toUpperCase(); // NUEVO | AGREGAR
  const listado = req.body?.listado;

  if (!Array.isArray(listado)) {
    return res.status(400).json({ ok: false, error: "listado debe ser un array" });
  }

  const rows = listado.map(sanitizeRow).filter(Boolean);

  if (!rows.length) {
    return res.status(400).json({ ok: false, error: "No hay filas válidas (falta DNI)" });
  }

  try {
    if (modo === "NUEVO") {
      // borra todo y carga de nuevo
      const del = await supabaseAdmin.from("personas").delete().neq("dni", "");
      if (del.error) return res.status(500).json({ ok: false, error: del.error.message });
    }

    // upsert por dni
    const up = await supabaseAdmin
      .from("personas")
      .upsert(rows, { onConflict: "dni" });

    if (up.error) return res.status(500).json({ ok: false, error: up.error.message });

    return res.status(200).json({
      ok: true,
      modo,
      recibidas: listado.length,
      guardadas: rows.length,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Error" });
  }
}
