// pages/api/buscar.js
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizarDNI(valor) {
  return String(valor ?? "")
    .replace(/[^\d]/g, "")
    .trim();
}

export default async function handler(req, res) {
  try {
    const dniRaw = req.query?.dni;
    const dni = normalizarDNI(dniRaw);

    if (!dni) return res.status(400).json({ found: false, error: "Falta DNI" });

    // Buscar en tabla personas
    const { data: persona, error } = await supabaseAdmin
      .from("personas")
      .select("dni, nombre, tipo_ingreso, puerta_acceso, ubicacion, cuota")
      .eq("dni", dni)
      .maybeSingle();

    if (error) return res.status(500).json({ found: false, error: error.message });

    // Log búsqueda (si tenés la tabla)
    await supabaseAdmin.from("logs_accesos").insert({
      dni,
      encontrado: !!persona,
    });

    if (!persona) return res.status(200).json({ found: false });

    // Responder con nombres como tu frontend espera
    return res.status(200).json({
      found: true,
      persona: {
        dni: persona.dni,
        nombre: persona.nombre,
        tipoIngreso: persona.tipo_ingreso,
        puertaAcceso: persona.puerta_acceso,
        ubicacion: persona.ubicacion,
        cuota: persona.cuota,
      },
    });
  } catch (e) {
    return res.status(500).json({ found: false, error: e?.message || "Error inesperado" });
  }
}
