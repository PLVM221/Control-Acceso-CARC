import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método no permitido" });
    }

    // Lee body (Next ya lo parsea como JSON si viene Content-Type: application/json)
    const body = req.body || {};

    const modo = String(body.modo || body.mode || "AGREGAR").toUpperCase();

    // ✅ Acepta cualquiera de estas claves
    const raw =
      body.listado ??
      body.persons ??
      body.personas ??
      body.data ??
      [];

    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: "Listado vacío" });
    }

    // Normalización + dedupe por DNI (evita el error ON CONFLICT ... a second time)
    const map = new Map(); // dni -> persona (queda la última)
    for (const p of raw) {
      const dni = String(p?.dni ?? "").replace(/[^\d]/g, "").trim();
      if (!dni) continue;

      map.set(dni, {
        dni,
        nombre: String(p?.nombre ?? "").trim(),
        tipo_ingreso: String(p?.tipoIngreso ?? p?.tipo_ingreso ?? "").trim(),
        puerta_acceso: String(p?.puertaAcceso ?? p?.puerta_acceso ?? "").trim(),
        ubicacion: String(p?.ubicacion ?? "").trim() || null,
        cuota: Number(String(p?.cuota ?? 1).trim()) === 0 ? 0 : 1,
      });
    }

    const listado = Array.from(map.values());

    if (listado.length === 0) {
      return res.status(400).json({ error: "Listado vacío (sin DNIs válidos)" });
    }

    // Si es NUEVO: borra toda la tabla antes
    if (modo === "NUEVO") {
      // borra todo (sin condición, supabase requiere filtro: usamos neq con vacío)
      const del = await supabaseAdmin.from("personas").delete().neq("dni", "");
      if (del.error) {
        return res.status(500).json({ error: `Error al borrar: ${del.error.message}` });
      }
    }

    // Upsert por dni (requiere dni PRIMARY KEY o UNIQUE)
    const up = await supabaseAdmin
      .from("personas")
      .upsert(listado, { onConflict: "dni" });

    if (up.error) {
      return res.status(500).json({ error: up.error.message });
    }

    return res.status(200).json({
      ok: true,
      processed: raw.length,
      unique: listado.length,
      modo,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error inesperado" });
  }
}
