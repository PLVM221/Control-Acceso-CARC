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

    let estado = "no_existe";
    let encontrado = false;
    let nombre = null;
    let tipo_ingreso = null;
    let ubicacion = null;
    let cuota = null;

    if (data) {
      encontrado = true;
      nombre = data.nombre ?? null;
      tipo_ingreso = data.tipo_ingreso ?? null;
      ubicacion = data.ubicacion ?? null;
      cuota = Number(data.cuota) === 0 ? 0 : 1;
      estado = cuota === 1 ? "ok" : "denegado";
    }

    try {
      await supabase.from("logs_busqueda").insert({
        ts: new Date().toISOString(),
        dni_buscado: dni,
        encontrado,
        nombre,
        tipo_ingreso,
        ubicacion,
        cuota,
        estado,
      });
    } catch (logErr) {
      console.error("Error guardando log_busqueda:", logErr.message);
    }

    try {
      await supabase.from("logs_accesos").insert({
        dni,
        encontrado,
        fecha: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("Error guardando logs_accesos:", logErr.message);
    }

    if (!data) {
      return res.status(200).json({
        found: false,
      });
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
