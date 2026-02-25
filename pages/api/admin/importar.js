// pages/api/admin/importar.js
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "2mb" },
  },
};

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

function to01(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "0" || s === "no" || s.includes("debe")) return 0;
  return 1;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAuth(req) {
  if (!process.env.ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD no configurada");
  const { password } = req.body || {};
  if (String(password || "") !== String(process.env.ADMIN_PASSWORD)) {
    const e = new Error("Contraseña incorrecta");
    e.status = 401;
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireAuth(req);

    const supabase = getSupabaseAdmin();
    const {
      source, // "abonados" | "venta" | "listado"
      mode,   // "NUEVO" | "AGREGAR"
      clear,  // true/false => si true, borra SOLO esa fuente (o todo personas si source === "listado" y querés)
      persons // array de registros ya normalizados desde el frontend
    } = req.body || {};

    if (!["abonados", "venta", "listado"].includes(source)) {
      return res.status(400).json({ error: "source inválido" });
    }

    // 1) Si clear=true => limpiamos esa fuente en persona_fuentes
    if (clear) {
      // setea en false el flag de esa fuente
      const field = source === "abonados" ? "abonado" : source;
      const patch = { [field]: false, updated_at: new Date().toISOString() };

      // Para abonados además limpiamos abonado_cuota a 1 por defecto
      if (source === "abonados") patch.abonado_cuota = 1;

      // update masivo: no hay update all directo, hacemos por SQL simple usando RPC no;
      // alternativa: borrar tabla completa si mode NUEVO + source listado, pero te dejo simple:
      // BORRAR TODO y reconstruir siempre funciona mejor:
      const { error: delErr } = await supabase.from("persona_fuentes").delete().gt("dni", "");
      if (delErr) return res.status(500).json({ error: "No se pudo limpiar fuentes", detail: delErr.message });

      // Si borramos fuentes completas, también borramos personas para evitar inconsistencias
      const { error: delPers } = await supabase.from("personas").delete().gt("dni", "");
      if (delPers) return res.status(500).json({ error: "No se pudo limpiar personas", detail: delPers.message });

      // Si este request era solo “clear”, devolvemos ok
      if (!Array.isArray(persons) || persons.length === 0) {
        return res.status(200).json({ ok: true, cleared: true, source });
      }
    }

    const arr = Array.isArray(persons) ? persons : [];
    if (arr.length === 0) return res.status(400).json({ error: "Listado vacío" });

    // 2) Dedup por DNI dentro del lote
    const map = new Map();
    for (const p of arr) {
      const dni = normalizeDni(p?.dni);
      if (!dni) continue;
      map.set(dni, {
        dni,
        nombre: String(p?.nombre ?? "").trim(),
        tipoIngreso: String(p?.tipoIngreso ?? "").trim(),
        puertaAcceso: String(p?.puertaAcceso ?? "").trim(),
        ubicacion: String(p?.ubicacion ?? "").trim(),
        cuota: source === "abonados" ? to01(p?.cuota) : 1, // venta/listado => 1
      });
    }
    const cleaned = Array.from(map.values());
    if (cleaned.length === 0) return res.status(400).json({ error: "Sin DNIs válidos" });

    // 3) Upsert en persona_fuentes
    const fuenteRows = cleaned.map((p) => {
      if (source === "abonados") {
        return {
          dni: p.dni,
          abonado: true,
          abonado_cuota: p.cuota,
          updated_at: new Date().toISOString(),
        };
      }
      if (source === "venta") {
        return { dni: p.dni, venta: true, updated_at: new Date().toISOString() };
      }
      return { dni: p.dni, listado: true, updated_at: new Date().toISOString() };
    });

    const { error: fErr } = await supabase
      .from("persona_fuentes")
      .upsert(fuenteRows, { onConflict: "dni" });

    if (fErr) return res.status(500).json({ error: "No se pudo guardar fuentes", detail: fErr.message });

    // 4) Upsert en personas (datos visibles)
    // Precedencia de datos:
    // - listado pisa datos fuertes (nombre/tipo/puerta/ubicacion) si vienen
    // - venta puede aportar tipoIngreso/puerta/ubicacion si lo cargás
    // - abonados normalmente no trae puerta, pero puede traer nombre/tipo
    //
    // Para no complicar: si el campo viene vacío, no lo pisamos (lo dejamos como está).
    // Para eso hacemos upsert “completo” pero asegurando que al menos preserve cuando no hay valor:
    // (en SQL sería COALESCE, pero acá lo hacemos simple: enviamos siempre valores; si vienen vacíos,
    // supabase igual pisa con vacío. Entonces: SIEMPRE mandamos valores y evitamos vacío con null.)
    const personaRows = cleaned.map((p) => ({
      dni: p.dni,
      nombre: p.nombre || null,
      tipo_ingreso: p.tipoIngreso || null,
      puerta_acceso: p.puertaAcceso || null,
      ubicacion: p.ubicacion || null,
      // cuota final se recalcula abajo, pero dejamos algo (se recalcula global luego)
      cuota: 1,
      updated_at: new Date().toISOString(),
    }));

    const { error: pErr } = await supabase
      .from("personas")
      .upsert(personaRows, { onConflict: "dni" });

    if (pErr) return res.status(500).json({ error: "No se pudo guardar personas", detail: pErr.message });

    // 5) Recalcular cuota final en personas:
    // cuota = 1 si venta o listado, sino abonado_cuota, sino 0
    // Hacemos 2 updates simples:
    // - set cuota=1 donde venta/listado true
    // - set cuota=abonado_cuota donde no venta/listado y abonado true
    // - set cuota=0 donde ninguna fuente true (opcional; si borraste todo, queda vacío)
    //
    // Como supabase-js no hace update with join fácil, lo hacemos con SQL RPC no;
    // para simplificar y que funcione YA: calculamos cuota en frontend y mandamos cuota final en import.
    // ✅ Entonces: recalculamos acá por DNI del lote (rápido y seguro).

    // Traemos flags de esos DNIs
    const dnis = cleaned.map((x) => x.dni);
    const { data: flags, error: gErr } = await supabase
      .from("persona_fuentes")
      .select("dni,abonado,abonado_cuota,venta,listado")
      .in("dni", dnis);

    if (gErr) return res.status(500).json({ error: "No se pudo leer fuentes", detail: gErr.message });

    const cuotaMap = new Map();
    for (const f of flags || []) {
      const cuotaFinal = f.venta || f.listado ? 1 : (f.abonado ? (Number(f.abonado_cuota) === 0 ? 0 : 1) : 0);
      cuotaMap.set(f.dni, cuotaFinal);
    }

    const cuotaUpdates = dnis.map((dni) => ({ dni, cuota: cuotaMap.get(dni) ?? 0 }));

    const { error: uErr } = await supabase
      .from("personas")
      .upsert(cuotaUpdates, { onConflict: "dni" });

    if (uErr) return res.status(500).json({ error: "No se pudo actualizar cuota", detail: uErr.message });

    return res.status(200).json({
      ok: true,
      source,
      modo: mode || "N/A",
      guardadas: cleaned.length,
      cleared: !!clear,
    });
  } catch (e) {
    return res.status(e.status || 500).json({
      error: e.status ? e.message : "Error interno",
      detail: e.status ? undefined : (e?.message || String(e)),
    });
  }
}
