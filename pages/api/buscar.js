import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  const dni = String(req.query.dni || "").replace(/\D/g, "");

  if (!dni) return res.status(400).json({ found: false, error: "DNI requerido" });

  // Buscar persona
  const { data: persona, error } = await supabaseAdmin
    .from("personas")
    .select("dni,nombre,tipo_ingreso,puerta_acceso,ubicacion,cuota")
    .eq("dni", dni)
    .maybeSingle();

  if (error) return res.status(500).json({ found: false, error: "Error BD" });

  const encontrado = !!persona;

  // Guardar log
  await supabaseAdmin.from("logs_busqueda").insert([{
    dni_buscado: dni,
    encontrado,
    nombre: persona?.nombre ?? null,
    tipo_ingreso: persona?.tipo_ingreso ?? null,
    puerta_acceso: persona?.puerta_acceso ?? null,
    ubicacion: persona?.ubicacion ?? null,
    cuota: persona?.cuota ?? null
  }]);

  if (!encontrado) return res.status(200).json({ found: false });

  return res.status(200).json({
    found: true,
    persona: {
      dni: persona.dni,
      nombre: persona.nombre,
      tipoIngreso: persona.tipo_ingreso || "",
      puertaAcceso: persona.puerta_acceso || "",
      ubicacion: persona.ubicacion || "",
      cuota: Number(persona.cuota ?? 1),
    },
  });
}
