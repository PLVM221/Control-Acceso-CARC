import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

function to01(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "0" || s === "no" || s.includes("debe")) return 0;
  return 1;
}

function dedupeByDni(arr) {
  const map = new Map();
  for (const item of arr || []) {
    const dni = normalizeDni(item?.dni);
    if (!dni) continue;

    map.set(dni, {
      dni,
      nombre: String(item?.nombre ?? "").trim(),
      tipoIngreso: String(item?.tipoIngreso ?? "").trim(),
      ubicacion: String(item?.ubicacion ?? "").trim(),
      cuota: to01(item?.cuota),
    });
  }
  return Array.from(map.values());
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function recalcularCuotasPorDni(dnis) {
  if (!Array.isArray(dnis) || dnis.length === 0) return;

  const { data: fuentes, error } = await supabase
    .from("persona_fuentes")
    .select("dni, abonado, abonado_cuota, venta, listado")
    .in("dni", dnis);

  if (error) throw new Error("No se pudo leer persona_fuentes: " + error.message);

  const updates = (fuentes || []).map((f) => {
    let cuota = 0;

    // prioridad: venta/listado siempre al día
    if (f.venta || f.listado) {
      cuota = 1;
    } else if (f.abonado) {
      cuota = Number(f.abonado_cuota) === 0 ? 0 : 1;
    }

    return {
      dni: f.dni,
      cuota,
      updated_at: new Date().toISOString(),
    };
  });

  if (updates.length === 0) return;

  const { error: upErr } = await supabase
    .from("personas")
    .upsert(updates, { onConflict: "dni" });

  if (upErr) throw new Error("No se pudo recalcular cuota: " + upErr.message);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { password, mode, source, clear, persons } = req.body || {};

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    if (!["abonados", "venta", "listado"].includes(source)) {
      return res.status(400).json({ error: "Fuente inválida" });
    }

    // ✅ Si viene clear=true, limpiamos toda la base
    // Esto se usa en modo NUEVO antes de empezar a subir lotes
    if (clear) {
      const { error: errFuentes } = await supabase
        .from("persona_fuentes")
        .delete()
        .gt("dni", "");

      if (errFuentes) {
        return res.status(500).json({ error: "No se pudo limpiar persona_fuentes", detail: errFuentes.message });
      }

      const { error: errPersonas } = await supabase
        .from("personas")
        .delete()
        .gt("dni", "");

      if (errPersonas) {
        return res.status(500).json({ error: "No se pudo limpiar personas", detail: errPersonas.message });
      }

      return res.status(200).json({
        ok: true,
        cleared: true,
        source,
      });
    }

    if (!Array.isArray(persons) || persons.length === 0) {
      return res.status(400).json({ error: "Listado vacío" });
    }

    const cleaned = dedupeByDni(persons);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "No hay DNIs válidos" });
    }

    // 🔹 1) Guardar flags en persona_fuentes
    let fuenteRows = [];

    if (source === "abonados") {
      fuenteRows = cleaned.map((p) => ({
        dni: p.dni,
        abonado: true,
        abonado_cuota: to01(p.cuota),
        updated_at: new Date().toISOString(),
      }));
    }

    if (source === "venta") {
      fuenteRows = cleaned.map((p) => ({
        dni: p.dni,
        venta: true,
        updated_at: new Date().toISOString(),
      }));
    }

    if (source === "listado") {
      fuenteRows = cleaned.map((p) => ({
        dni: p.dni,
        listado: true,
        updated_at: new Date().toISOString(),
      }));
    }

    // upsert en bloques por seguridad
    const fuenteChunks = chunkArray(fuenteRows, 500);
    for (const chunk of fuenteChunks) {
      const { error } = await supabase
        .from("persona_fuentes")
        .upsert(chunk, { onConflict: "dni" });

      if (error) {
        return res.status(500).json({
          error: "No se pudo guardar persona_fuentes",
          detail: error.message,
        });
      }
    }

    // 🔹 2) Guardar datos visibles en personas
    // puerta_acceso ya NO se usa
    const personaRows = cleaned.map((p) => ({
      dni: p.dni,
      nombre: p.nombre || null,
      tipo_ingreso: p.tipoIngreso || null,
      ubicacion: p.ubicacion || null,
      cuota: source === "abonados" ? to01(p.cuota) : 1,
      updated_at: new Date().toISOString(),
    }));

    const personaChunks = chunkArray(personaRows, 500);
    for (const chunk of personaChunks) {
      const { error } = await supabase
        .from("personas")
        .upsert(chunk, { onConflict: "dni" });

      if (error) {
        return res.status(500).json({
          error: "No se pudo guardar personas",
          detail: error.message,
        });
      }
    }

    // 🔹 3) Recalcular cuota final para esos DNI
    await recalcularCuotasPorDni(cleaned.map((x) => x.dni));

    return res.status(200).json({
      ok: true,
      source,
      mode,
      guardadas: cleaned.length,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Error interno",
      detail: e.message || String(e),
    });
  }
}
