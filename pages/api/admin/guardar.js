import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { modo, listado } = req.body;

    if (!Array.isArray(listado) || listado.length === 0) {
      return res.status(400).json({ error: "Listado vacío" });
    }

    // LIMPIAR DNI + normalizar todo
    const datos = listado.map(p => ({
      dni: String(p.dni).trim(),
      nombre: String(p.nombre || "").trim(),
      tipo_ingreso: String(p.tipoIngreso || "").trim(),
      puerta_acceso: String(p.puertaAcceso || "").trim(),
      ubicacion: String(p.ubicacion || "").trim(),
      cuota: Number(p.cuota) === 0 ? 0 : 1
    }));

    if (modo === "NUEVO") {
      await supabase.from("personas").delete().neq("dni", "");
    }

    // UPSERT = inserta o actualiza si existe
    const { error } = await supabase
      .from("personas")
      .upsert(datos, { onConflict: "dni" });

    if (error) throw error;

    res.json({ ok: true, total: datos.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
