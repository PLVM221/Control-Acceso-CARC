import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const dni = normalizeDni(req.query.dni);

    if (!dni) {
      return res.status(400).json({
        found: false,
        error: "DNI inválido",
      });
    }

    const { data, error } = await supabase
      .from("personas")
      .select("dni, nombre, tipo_ingreso, ubicacion, cuota")
      .eq("dni", dni)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        found: false,
        error: "Error consultando base",
        detail: error.message,
      });
    }

    try {
      await supabase.from("logs_accesos").insert({
        dni,
        encontrado: !!data,
        fecha: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Error guardando log:", e.message);
    }

    if (!data) {
      return res.status(200).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      persona: {
        dni: data.dni,
        nombre: data.nombre,
        tipoIngreso: data.tipo_ingreso,
        ubicacion: data.ubicacion,
        cuota: Number(data.cuota) === 0 ? 0 : 1,
      },
    });
  } catch (e) {
    return res.status(500).json({
      found: false,
      error: "Error interno",
      detail: e.message || String(e),
    });
  }
}
