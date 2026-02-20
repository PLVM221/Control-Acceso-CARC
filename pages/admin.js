// pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";

const LS_ADMIN = "carc_admin_ok";
const LS_BASE = "carc_base_personas_v1";
const LS_LOGS = "carc_admin_logs_v1";

function nowISO() {
  return new Date().toISOString();
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeJSONParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e?.message || "JSON inválido" };
  }
}

function normalizePersona(p) {
  // Campos esperados:
  // dni (string), nombre (string), tipoIngreso (string), puertaAcceso (string), ubicacion (string opcional), cuota (0/1)
  const dni = String(p?.dni ?? "").trim();
  const nombre = String(p?.nombre ?? "").trim();
  const tipoIngreso = String(p?.tipoIngreso ?? "").trim();
  const puertaAcceso = String(p?.puertaAcceso ?? "").trim();
  const ubicacion = String(p?.ubicacion ?? "").trim();
  let cuotaRaw = p?.cuota;
  // cuota puede venir como "0"/"1", 0/1, true/false
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
  // DNI mínimo 1 dígito (hay DNIs menores a 8)
  if (!p?.dni) return false;
  if (!/^\d+$/.test(p.dni)) return false;
  if (!p?.nombre) return false;
  // los otros pueden ser vacíos si querés, pero normalmente se cargan
  return true;
}

function mergeByDNI(existingList, incomingList) {
  const map = new Map();
  for (const p of existingList) map.set(p.dni, p);
  for (const p of incomingList) map.set(p.dni, p);
  return Array.from(map.values());
}

// CSV simple: separador coma o punto y coma.
// Encabezado esperado:
// dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { ok: false, error: "CSV vacío" };

  const header = lines[0];
  const sep = header.includes(";") ? ";" : ",";
  const cols = header.split(sep).map((c) => c.trim());

  const idx = (name) => cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());

  const iDni = idx("dni");
  const iNombre = idx("nombre");
  const iTipo = idx("tipoIngreso");
  const iPuerta = idx("puertaAcceso");
  const iUbic = idx("ubicacion");
  const iCuota = idx("cuota");

  if (iDni < 0 || iNombre < 0) {
    return {
      ok: false,
      error:
        "El CSV debe tener encabezados al menos: dni,nombre (y opcional: tipoIngreso,puertaAcceso,ubicacion,cuota).",
    };
  }

  const out = [];
  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const parts = row.split(sep).map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
    const p = normalizePersona({
      dni: parts[iDni] ?? "",
      nombre: parts[iNombre] ?? "",
      tipoIngreso: iTipo >= 0 ? parts[iTipo] : "",
      puertaAcceso: iPuerta >= 0 ? parts[iPuerta] : "",
      ubicacion: iUbic >= 0 ? parts[iUbic] : "",
      cuota: iCuota >= 0 ? parts[iCuota] : 1,
    });
    out.push(p);
  }

  return { ok: true, value: out };
}

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);

  const [mode, setMode] = useState("AGREGAR"); // AGREGAR o NUEVO
  const [text, setText] = useState(
    `[\n  {\n    "dni":"25328387",\n    "nombre":"Martin Lagamma",\n    "tipoIngreso":"Empleado",\n    "puertaAcceso":"Puerta 1-2-3-4-5-10",\n    "ubicacion":"Total",\n    "cuota":1\n  }\n]\n`
  );

  const [base, setBase] = useState([]); // base actual local
  const [msg, setMsg] = useState({ type: "", text: "" });

  const fileRef = useRef(null);

  // cargar estado inicial
  useEffect(() => {
    const ok = localStorage.getItem(LS_ADMIN) === "1";
    setLogged(ok);

    const saved = localStorage.getItem(LS_BASE);
    if (saved) {
      const parsed = safeJSONParse(saved);
      if (parsed.ok && Array.isArray(parsed.value)) setBase(parsed.value);
    }
  }, []);

  const baseCount = base.length;

  const parsedInput = useMemo(() => {
    // intentar JSON primero
    const parsed = safeJSONParse(text);
    if (parsed.ok) {
      if (!Array.isArray(parsed.value)) {
        return { ok: false, error: "El JSON debe ser un ARRAY de personas: [ {..}, {..} ]" };
      }
      const normalized = parsed.value.map(normalizePersona).filter(isValidPersona);
      return { ok: true, value: normalized };
    }
    return { ok: false, error: parsed.error };
  }, [text]);

  function addAdminLog(entry) {
    const raw = localStorage.getItem(LS_LOGS);
    const parsed = raw ? safeJSONParse(raw) : { ok: true, value: {} };
    const logs = parsed.ok && parsed.value && typeof parsed.value === "object" ? parsed.value : {};
    const key = todayKey();
    const arr = Array.isArray(logs[key]) ? logs[key] : [];
    arr.unshift({ at: nowISO(), ...entry });
    logs[key] = arr;
    localStorage.setItem(LS_LOGS, JSON.stringify(logs, null, 2));
  }

  function login() {
    // LOGIN SIMPLE LOCAL: guarda bandera en localStorage
    // Si querés, después lo conectamos a ADMIN_PASSWORD en server.
    if (!password || password.trim().length < 3) {
      setMsg({ type: "err", text: "Ingresá una contraseña válida." });
      return;
    }
    localStorage.setItem(LS_ADMIN, "1");
    setLogged(true);
    setPassword("");
    setMsg({ type: "ok", text: "Logueado ✅" });
    addAdminLog({ action: "LOGIN_OK" });
  }

  function logout() {
    localStorage.removeItem(LS_ADMIN);
    setLogged(false);
    setMsg({ type: "info", text: "Saliste del admin." });
    addAdminLog({ action: "LOGOUT" });
  }

  function clearMsgSoon() {
    setTimeout(() => setMsg({ type: "", text: "" }), 2500);
  }

  function handleSave() {
    if (!parsedInput.ok) {
      setMsg({ type: "err", text: `No se puede guardar: ${parsedInput.error}` });
      clearMsgSoon();
      return;
    }

    const incoming = parsedInput.value;

    let next = [];
    if (mode === "NUEVO") {
      next = incoming;
    } else {
      next = mergeByDNI(base, incoming);
    }

    // guardar base
    localStorage.setItem(LS_BASE, JSON.stringify(next, null, 2));
    setBase(next);

    addAdminLog({
      action: mode === "NUEVO" ? "BASE_REPLACED" : "BASE_MERGED",
      incoming: incoming.length,
      total: next.length,
    });

    setMsg({
      type: "ok",
      text:
        mode === "NUEVO"
          ? `Base reemplazada ✅ (${incoming.length} registros)`
          : `Base actualizada ✅ (+${incoming.length} / total ${next.length})`,
    });
    clearMsgSoon();
  }

  function handleFilePick() {
    fileRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const txt = await file.text();

    if (name.endsWith(".json")) {
      setText(txt);
      setMsg({ type: "info", text: "JSON cargado en el editor." });
      clearMsgSoon();
      addAdminLog({ action: "FILE_LOADED_JSON", filename: file.name, bytes: file.size });
      return;
    }

    if (name.endsWith(".csv")) {
      const parsed = parseCSV(txt);
      if (!parsed.ok) {
        setMsg({ type: "err", text: parsed.error });
        clearMsgSoon();
        return;
      }
      // lo pasamos a JSON en el textarea para que puedas ver/editar
      const json = JSON.stringify(parsed.value, null, 2);
      setText(json);
      setMsg({ type: "ok", text: `CSV convertido a JSON ✅ (${parsed.value.length} filas)` });
      clearMsgSoon();
      addAdminLog({ action: "FILE_LOADED_CSV", filename: file.name, rows: parsed.value.length, bytes: file.size });
      return;
    }

    setMsg({ type: "err", text: "Subí un .csv o .json" });
    clearMsgSoon();
  }

  function downloadBaseJSON() {
    const raw = localStorage.getItem(LS_BASE) || "[]";
    downloadText("personas.json", raw, "application/json;charset=utf-8");
    addAdminLog({ action: "DOWNLOAD_BASE_JSON" });
  }

  function downloadLogsJSON() {
    const raw = localStorage.getItem(LS_LOGS) || "{}";
    downloadText("admin-logs.json", raw, "application/json;charset=utf-8");
    addAdminLog({ action: "DOWNLOAD_LOGS" });
  }

  // estilos
  const bg = {
    minHeight: "100vh",
    padding: 24,
    background: "linear-gradient(180deg, #0b4db3 0%, #083a86 100%)",
    fontFamily: "Lexend, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const card = {
    width: "min(980px, 96vw)",
    background: "#fff",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
  };

  const h1 = { margin: 0, fontSize: 34, fontWeight: 900, letterSpacing: "-0.02em" };
  const row = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };
  const label = { fontWeight: 800, color: "#0b3ea8" };

  const select = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #c9d6ea",
    background: "#fff",
    fontWeight: 800,
  };

  const btn = (variant) => ({
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    ...(variant === "primary"
      ? { background: "#0b3ea8", color: "#fff" }
      : variant === "warn"
      ? { background: "#ffd100", color: "#111" }
      : { background: "#eef2f7", color: "#111" }),
  });

  const textarea = {
    width: "100%",
    minHeight: 320,
    resize: "vertical",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    fontSize: 14,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #c9d6ea",
    outline: "none",
  };

  const pill = (t) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 14,
    background:
      t === "ok" ? "#e8fff1" : t === "err" ? "#ffe9ea" : t === "info" ? "#eef6ff" : "#f4f6f8",
    color: t === "err" ? "#7a0c12" : "#111",
    border: "1px solid rgba(0,0,0,0.06)",
    fontWeight: 800,
  });

  return (
    <div style={bg}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={h1}>Admin — Control Acceso CARC</h1>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 900, color: "#0b3ea8" }}>
              Base local: <span style={{ color: "#111" }}>{baseCount} registros</span>
            </div>
            {logged ? (
              <button onClick={logout} style={btn()}>
                Salir
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ height: 14 }} />

        {!logged ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 900, color: "#0b3ea8" }}>Ingresá contraseña admin</div>

            {/* ✅ FORM para que ENTER funcione */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                login();
              }}
              style={{ display: "flex", gap: 12, alignItems: "center" }}
            >
              <input
                type="password"
                placeholder="Contraseña admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid #c9d6ea",
                  fontSize: "16px",
                  flex: 1,
                }}
              />
              <button type="submit" style={btn("primary")}>
                Entrar
              </button>
            </form>

            {msg.text ? <div style={pill(msg.type)}>{msg.text}</div> : null}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={row}>
              <div style={label}>Modo de carga:</div>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={select}>
                <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
                <option value="NUEVO">NUEVO (borra y reemplaza todo)</option>
              </select>

              <button onClick={handleSave} style={btn("primary")}>
                Guardar listado
              </button>

              <button onClick={handleFilePick} style={btn("warn")}>
                Subir CSV / JSON
              </button>

              <button onClick={downloadBaseJSON} style={btn()}>
                Descargar base (JSON)
              </button>

              <button onClick={downloadLogsJSON} style={btn()}>
                Descargar logs
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>

            <div style={{ height: 10 }} />

            <div style={{ color: "#1f2a37", fontWeight: 700 }}>
              Pegá tu listado en formato <b>JSON</b> o subí un <b>CSV/JSON</b>.
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                CSV esperado (encabezados): <b>dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota</b> (cuota: 1 al día / 0 debe)
              </div>
            </div>

            <div style={{ height: 10 }} />

            <textarea value={text} onChange={(e) => setText(e.target.value)} style={textarea} />

            <div style={{ height: 10 }} />

            <div style={row}>
              <div style={pill("ok")}>✅ Logueado</div>

              {parsedInput.ok ? (
                <div style={pill("info")}>Listo para guardar: {parsedInput.value.length} registros válidos</div>
              ) : (
                <div style={pill("err")}>JSON inválido: {parsedInput.error}</div>
              )}

              {msg.text ? <div style={pill(msg.type)}>{msg.text}</div> : null}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Ruta: <b>/admin</b>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
