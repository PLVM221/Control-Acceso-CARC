import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

async function getPartidoActivo() {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("partidos_config")
    .select("id, rival, fecha_hora_partido, log_desde, log_hasta, activo")
    .eq("activo", true)
    .lte("log_desde", nowIso)
    .gte("log_hasta", nowIso)
    .order("log_desde", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error buscando partido activo:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    ...data,
    partido: `Rosario Central vs. ${data.rival}`,
  };
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

    const partidoActivo = await getPartidoActivo();
    const nombrePartido = partidoActivo?.partido || "Sin partido activo";

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
        partido: nombrePartido,
      });
    } catch (logErr) {
      console.error("Error guardando logs_busqueda:", logErr.message);
    }

    try {
      await supabase.from("logs_accesos").insert({
        dni,
        encontrado,
        fecha: new Date().toISOString(),
        partido: nombrePartido,
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
      partido: nombrePartido,
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
