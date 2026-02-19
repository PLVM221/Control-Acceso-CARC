import { supabaseAdmin } from "../../../lib/supabaseAdmin";

function isAuth(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  return !!token; // demo simple (si querés, lo endurecemos después)
}

export default async function handler(req, res) {
  if (!isAuth(req)) return res.status(401).json({ ok: false, error: "No autorizado" });

  if (req.method === "POST") {
    const { modo, personas } = req.body || {};
    if (!Array.isArray(personas)) return res.status(400).json({ ok: false, error: "personas debe ser array" });
    if (!["REEMPLAZAR", "AGREGAR"].includes(modo)) return res.status(400).json({ ok: false, error: "modo inválido" });

    // Normalizar keys (soporta varias variantes)
    const rows = personas
      .map((p) => ({
        dni: String(p.dni || "").replace(/\D/g, ""),
        nombre: String(p.nombre || "").trim(),
        tipo_ingreso: String(p.tipoIngreso ?? p.tipo_ingreso ?? "").trim(),
        puerta_acceso: String(p.puertaAcceso ?? p.puerta_acceso ?? p.puerta ?? "").trim(),
        ubicacion: String(p.ubicacion ?? "").trim(),
        cuota: Number(p.cuota ?? 1),
        updated_at: new Date().toISOString(),
      }))
      .filter((p) => p.dni && p.nombre);

    if (!rows.length) return res.status(400).json({ ok: false, error: "No hay filas válidas" });

    if (modo === "REEMPLAZAR") {
      // Borrar todo
      const del = await supabaseAdmin.from("personas").delete().neq("dni", "__never__");
      if (del.error) return res.status(500).json({ ok: false, error: "No se pudo borrar" });
    }

    // Upsert por DNI
    const up = await supabaseAdmin.from("personas").upsert(rows, { onConflict: "dni" });
    if (up.error) return res.status(500).json({ ok: false, error: "No se pudo guardar" });

    const count = await supabaseAdmin.from("personas").select("dni", { count: "exact", head: true });
    return res.status(200).json({ ok: true, total: count.count ?? null });
  }

  return res.status(405).json({ ok: false });
}
