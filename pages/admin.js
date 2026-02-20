// pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";

const LS_BASE = "carc_base_personas_v1";
const LS_ADMIN_OK = "carc_admin_ok_v1";

function safeJSONParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e?.message || "JSON inválido" };
  }
}

function normalizePersona(p) {
  const dni = String(p?.dni ?? "").trim();
  const nombre = String(p?.nombre ?? "").trim();
  const tipoIngreso = String(p?.tipoIngreso ?? p?.sector ?? "").trim();
  const puertaAcceso = String(p?.puertaAcceso ?? "").trim();
  const ubicacion = String(p?.ubicacion ?? "").trim();

  let cuotaRaw = p?.cuota;
  let cuota = 1;
  if (cuotaRaw === 0 || cuotaRaw === "0" || cuotaRaw === false || cuotaRaw === "false") cuota = 0;
  if (cuotaRaw === 1 || cuotaRaw === "1" || cuotaRaw === true || cuotaRaw === "true") cuota = 1;

  return {
    dni,
    nombre,
    tipoIngreso,
    puertaAcceso,
    ...(ubicacion ? { ubicacion } : {}),
    cuota,
  };
}

function isValidPersona(p) {
  if (!p?.dni) return false;
  if (!/^\d+$/.test(p.dni)) return false;
  if (!p?.nombre) return false;
  return true;
}

function mergeByDni(existing, incoming) {
  const map = new Map();
  for (const p of existing) map.set(String(p.dni), p);
  for (const p of incoming) map.set(String(p.dni), p); // pisa por DNI
  return Array.from(map.values());
}

function parseCSV(text) {
  // CSV simple con separador coma o punto y coma
  // Headers esperados:
  // dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
  // cuota: 1 o 0 (opcional, default 1)
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return { ok: false, error: "CSV vacío o sin filas." };

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());

  const idx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const iDni = idx("dni");
  const iNombre = idx("nombre");
  const iTipo = idx("tipoIngreso");
  const iPuerta = idx("puertaAcceso");
  const iUbic = idx("ubicacion");
  const iCuota = idx("cuota");

  if (iDni === -1 || iNombre === -1) {
    return {
      ok: false,
      error:
        "Faltan columnas obligatorias en el CSV. Mínimo: dni,nombre (y opcionales: tipoIngreso,puertaAcceso,ubicacion,cuota).",
    };
  }

  const out = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = {
      dni: cols[iDni] ?? "",
      nombre: cols[iNombre] ?? "",
      tipoIngreso: iTipo >= 0 ? cols[iTipo] ?? "" : "",
      puertaAcceso: iPuerta >= 0 ? cols[iPuerta] ?? "" : "",
      ubicacion: iUbic >= 0 ? cols[iUbic] ?? "" : "",
      cuota: iCuota >= 0 ? cols[iCuota] ?? "1" : "1",
    };
    const p = normalizePersona(row);
    if (isValidPersona(p)) out.push(p);
  }

  if (!out.length) return { ok: false, error: "No se pudo leer ninguna fila válida (dni numérico y nombre requerido)." };
  return { ok: true, value: out };
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("AGREGAR"); // o NUEVO
  const [text, setText] = useState(
    `[
  {
    "dni":"25328387",
    "nombre":"Martin Lagamma",
    "tipoIngreso":"Empleado",
    "puertaAcceso":"Puerta 1-2-3-4-5-10",
    "ubicacion":"Total",
    "cuota":1
  }
]`
  );

  const [status, setStatus] = useState({ type: "", text: "" });
  const fileRef = useRef(null);
  const passRef = useRef(null);

  useEffect(() => {
    const ok = localStorage.getItem(LS_ADMIN_OK) === "1";
    setAuthed(ok);
    setTimeout(() => {
      if (!ok && passRef.current) passRef.current.focus();
    }, 0);
  }, []);

  const styles = useMemo(
    () => ({
      page: {
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #0b4db3 0%, #083a86 100%)",
        fontFamily: "Lexend, system-ui, -apple-system, Segoe UI, Roboto, Arial",
        display: "flex",
        justifyContent: "center",
      },
      card: {
        width: "min(980px, 96vw)",
        background: "#fff",
        borderRadius: 22,
        padding: 22,
        boxShadow: "0 16px 46px rgba(0,0,0,0.25)",
      },
      h1: { margin: 0, fontSize: 36, fontWeight: 1000, letterSpacing: "-0.02em" },
      row: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 },
      label: { fontWeight: 900 },
      select: { padding: "10px 12px", borderRadius: 12, border: "1px solid #c9d6ea", fontWeight: 800 },
      btn: (variant) => ({
        padding: "10px 14px",
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        fontWeight: 900,
        background: variant === "primary" ? "#0b3ea8" : "#eef2f7",
        color: variant === "primary" ? "#fff" : "#111",
      }),
      textarea: {
        width: "100%",
        minHeight: 340,
        borderRadius: 16,
        border: "1px solid #c9d6ea",
        padding: 14,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 14,
        lineHeight: 1.4,
        marginTop: 10,
      },
      status: (type) => ({
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.06)",
        fontWeight: 900,
        background:
          type === "ok" ? "#e8fff1" : type === "warn" ? "#fff4cc" : type === "err" ? "#ffe0e0" : "#f4f6f8",
        color: type === "ok" ? "#0b4a22" : type === "warn" ? "#6a4b00" : type === "err" ? "#7a0b0b" : "#111",
      }),
      logged: {
        marginTop: 14,
        padding: 12,
        borderRadius: 12,
        background: "#f2f2f2",
        fontWeight: 900,
        display: "flex",
        gap: 10,
        alignItems: "center",
      },
      hint: { marginTop: 10, fontWeight: 800, opacity: 0.85 },
      route: { marginTop: 10, opacity: 0.7, fontWeight: 800 },
      passBox: { marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
      pass: { padding: "12px 14px", borderRadius: 12, border: "1px solid #c9d6ea", fontWeight: 900, minWidth: 240 },
      file: { display: "none" },
    }),
    []
  );

  function login() {
    // Por ahora password fija local (después con env var y supabase)
    const ok = password === "admin123";
    if (!ok) {
      setStatus({ type: "err", text: "Contraseña incorrecta." });
      return;
    }
    localStorage.setItem(LS_ADMIN_OK, "1");
    setAuthed(true);
    setStatus({ type: "ok", text: "Logueado." });
  }

  function logout() {
    localStorage.removeItem(LS_ADMIN_OK);
    setAuthed(false);
    setPassword("");
    setStatus({ type: "", text: "" });
    setTimeout(() => {
      if (passRef.current) passRef.current.focus();
    }, 0);
  }

  function saveList() {
    const parsed = safeJSONParse(text);
    if (!parsed.ok || !Array.isArray(parsed.value)) {
      setStatus({ type: "err", text: "JSON inválido. Pegá un array [ { ... }, ... ]." });
      return;
    }

    const incoming = parsed.value.map(normalizePersona).filter(isValidPersona);
    if (!incoming.length) {
      setStatus({ type: "err", text: "No hay filas válidas. Requiere dni numérico y nombre." });
      return;
    }

    const existingRaw = localStorage.getItem(LS_BASE);
    const existingParsed = existingRaw ? safeJSONParse(existingRaw) : { ok: true, value: [] };
    const existing = existingParsed.ok && Array.isArray(existingParsed.value)
      ? existingParsed.value.map(normalizePersona).filter(isValidPersona)
      : [];

    const finalArr = mode === "NUEVO" ? incoming : mergeByDni(existing, incoming);

    localStorage.setItem(LS_BASE, JSON.stringify(finalArr, null, 2));
    setStatus({
      type: "ok",
      text: `Guardado OK. Registros en base: ${finalArr.length}. Modo: ${mode}.`,
    });
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const textFile = await file.text();

    if (ext === "json") {
      // si es JSON array, lo pegamos directo en el textarea (formateado)
      const parsed = safeJSONParse(textFile);
      if (!parsed.ok || !Array.isArray(parsed.value)) {
        setStatus({ type: "err", text: "El JSON del archivo no es un array válido." });
        return;
      }
      setText(JSON.stringify(parsed.value, null, 2));
      setStatus({ type: "ok", text: "Archivo JSON cargado. Ahora tocá “Guardar listado”." });
      return;
    }

    if (ext === "csv") {
      const parsed = parseCSV(textFile);
      if (!parsed.ok) {
        setStatus({ type: "err", text: parsed.error });
        return;
      }
      setText(JSON.stringify(parsed.value, null, 2));
      setStatus({ type: "ok", text: "CSV importado y convertido a JSON. Ahora tocá “Guardar listado”." });
      return;
    }

    setStatus({ type: "warn", text: "Formato no soportado. Subí .json o .csv" });
  }

  if (!authed) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Admin — Control Acceso CARC</h1>

          <div style={styles.hint}>Ingresá la contraseña para entrar.</div>

          {/* ✅ ENTER PARA INGRESAR */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login();
            }}
            style={styles.passBox}
          >
            <input
              ref={passRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              style={styles.pass}
            />
            <button type="submit" style={styles.btn("primary")}>
              Entrar
            </button>
          </form>

          {status.text ? <div style={styles.status(status.type)}>{status.text}</div> : null}

          <div style={styles.route}>Ruta: /admin</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={styles.h1}>Admin — Control Acceso CARC</h1>
          <button onClick={logout} style={styles.btn()}>
            Salir
          </button>
        </div>

        <div style={styles.row}>
          <div style={styles.label}>Modo de carga:</div>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={styles.select}>
            <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
            <option value="NUEVO">NUEVO (borra y reemplaza todo)</option>
          </select>

          <button onClick={saveList} style={styles.btn("primary")}>
            Guardar listado
          </button>
        </div>

        {/* ✅ SUBIDA DE ARCHIVO */}
        <div style={styles.row}>
          <div style={{ fontWeight: 900 }}>Cargar archivo:</div>

          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv"
            style={styles.file}
            onChange={onPickFile}
          />

          <button
            onClick={() => fileRef.current?.click()}
            style={styles.btn()}
            type="button"
          >
            Seleccionar archivo (.json / .csv)
          </button>
        </div>

        <div style={styles.hint}>Pegá acá tu listado en formato <b>JSON</b> (o subí CSV/JSON arriba).</div>

        <textarea value={text} onChange={(e) => setText(e.target.value)} style={styles.textarea} />

        {status.text ? <div style={styles.status(status.type)}>{status.text}</div> : null}

        <div style={styles.logged}>✅ Logueado</div>
        <div style={styles.route}>Ruta: /admin</div>
      </div>
    </div>
  );
}
