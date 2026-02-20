import { useEffect, useMemo, useRef, useState } from "react";

const LS_AUTH = "carc_admin_auth_v1";

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]+/g, "")
    .replace(/[^\w]/g, "");
}

function detectDelimiter(line) {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const c = (line.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

function splitCsvLine(line, delim) {
  // CSV simple con comillas
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // doble comilla dentro de comillas => ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCSV(text) {
  const rawLines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (!rawLines.length) {
    return { headers: [], rows: [] };
  }

  const delim = detectDelimiter(rawLines[0]);
  const headers = splitCsvLine(rawLines[0], delim);
  const rows = [];

  for (let i = 1; i < rawLines.length; i++) {
    const cols = splitCsvLine(rawLines[i], delim);
    // relleno a largo headers
    while (cols.length < headers.length) cols.push("");
    rows.push(cols.slice(0, headers.length));
  }

  return { headers, rows };
}

function mapHeadersToFields(headers) {
  // campos esperados en DB/API
  // dni, nombre, tipoIngreso, puertaAcceso, ubicacion, cuota
  const norm = headers.map(normalizeHeader);

  const pick = (aliases) => {
    for (const a of aliases) {
      const idx = norm.indexOf(normalizeHeader(a));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  return {
    dni: pick(["dni", "documento", "doc", "nrodoc", "nrodocumento"]),
    nombre: pick(["nombre", "apellidoNombre", "apellidoynombre", "socio", "titular"]),
    tipoIngreso: pick(["tipoingreso", "tipo", "categoria", "sector", "ingreso"]),
    puertaAcceso: pick(["puertaacceso", "puerta", "acceso", "puertas"]),
    ubicacion: pick(["ubicacion", "ubicación", "lugar", "zona"]),
    cuota: pick(["cuota", "estadocuota", "pago", "alDia", "aldiacuota"]),
  };
}

function toInt01(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "si" || s === "sí" || s === "ok" || s === "aldia" || s === "al dia")
    return 1;
  if (s === "0" || s === "false" || s === "no" || s === "debe") return 0;
  const n = Number(s);
  if (!Number.isNaN(n)) return n > 0 ? 1 : 0;
  return 1; // default: al día
}

function cleanDni(v) {
  return String(v ?? "")
    .replace(/[^\d]/g, "")
    .trim();
}

export default function AdminPage() {
  const fileRef = useRef(null);

  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState("");

  const [mode, setMode] = useState("AGREGAR"); // NUEVO | AGREGAR
  const [jsonText, setJsonText] = useState("[]");

  const [csvInfo, setCsvInfo] = useState({
    name: "",
    total: 0,
    valid: 0,
    headers: [],
    headerMap: null,
  });

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setLogged(localStorage.getItem(LS_AUTH) === "1");
  }, []);

  function logout() {
    localStorage.removeItem(LS_AUTH);
    setLogged(false);
    setPassword("");
    setStatusMsg("");
    setErrorMsg("");
  }

  async function doLogin() {
    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Clave incorrecta");
        return;
      }
      localStorage.setItem(LS_AUTH, "1");
      setLogged(true);
      setPassword("");
    } catch (e) {
      setErrorMsg("Error de conexión");
    }
  }

  function clearCsv() {
    setCsvInfo({ name: "", total: 0, valid: 0, headers: [], headerMap: null });
    setStatusMsg("");
    setErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function fillJsonFromCsv(headers, rows, filename) {
    const headerMap = mapHeadersToFields(headers);
    const out = [];
    let valid = 0;

    for (const r of rows) {
      const dni = headerMap.dni >= 0 ? cleanDni(r[headerMap.dni]) : "";
      if (!dni) continue;

      const nombre = headerMap.nombre >= 0 ? String(r[headerMap.nombre] ?? "").trim() : "";
      const tipoIngreso = headerMap.tipoIngreso >= 0 ? String(r[headerMap.tipoIngreso] ?? "").trim() : "";
      const puertaAcceso = headerMap.puertaAcceso >= 0 ? String(r[headerMap.puertaAcceso] ?? "").trim() : "";
      const ubicacion = headerMap.ubicacion >= 0 ? String(r[headerMap.ubicacion] ?? "").trim() : "";
      const cuota = headerMap.cuota >= 0 ? toInt01(r[headerMap.cuota]) : 1;

      out.push({
        dni,
        nombre,
        tipoIngreso,
        puertaAcceso,
        ...(ubicacion ? { ubicacion } : {}),
        cuota,
      });
      valid++;
    }

    setCsvInfo({
      name: filename,
      total: rows.length,
      valid,
      headers,
      headerMap,
    });

    setJsonText(JSON.stringify(out, null, 2));
  }

  async function onPickCsv(e) {
    setStatusMsg("");
    setErrorMsg("");

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (!headers.length) {
        setErrorMsg("CSV vacío o no se detectó encabezado");
        return;
      }

      fillJsonFromCsv(headers, rows, file.name);
      setStatusMsg(`CSV cargado: ${file.name} — Filas: ${rows.length}`);
    } catch (err) {
      setErrorMsg("No se pudo leer el CSV");
    }
  }

  function parseJsonListado() {
    const parsed = JSON.parse(jsonText || "[]");
    if (!Array.isArray(parsed)) throw new Error("El JSON debe ser un array");

    // normalizo y filtro
    const cleaned = [];
    for (const p of parsed) {
      const dni = cleanDni(p?.dni);
      if (!dni) continue;

      const nombre = String(p?.nombre ?? "").trim();
      const tipoIngreso = String(p?.tipoIngreso ?? "").trim();
      const puertaAcceso = String(p?.puertaAcceso ?? "").trim();
      const ubicacion = String(p?.ubicacion ?? "").trim();
      const cuota = toInt01(p?.cuota ?? 1);

      cleaned.push({
        dni,
        nombre,
        tipoIngreso,
        puertaAcceso,
        ...(ubicacion ? { ubicacion } : {}),
        cuota,
      });
    }
    return cleaned;
  }

  async function guardarListado() {
    setStatusMsg("");
    setErrorMsg("");

    let listado;
    try {
      listado = parseJsonListado();
    } catch (e) {
      setErrorMsg(e.message || "JSON inválido");
      return;
    }

    if (!listado.length) {
      setErrorMsg("No hay datos para guardar (CSV vacío o JSON inválido)");
      return;
    }

    try {
      const res = await fetch("/api/admin/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: mode, // "NUEVO" o "AGREGAR"
          listado,    // <-- IMPORTANTE: esta clave
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo guardar");
        return;
      }

      setStatusMsg(
        `Guardado OK — procesados: ${data.processed ?? listado.length}, insertados: ${data.inserted ?? "?"}, actualizados: ${data.updated ?? "?"}`
      );
    } catch (err) {
      setErrorMsg("Error de conexión con el servidor");
    }
  }

  const recommendedHeaders = useMemo(
    () => "dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota",
    []
  );

  // UI styles inline (para no depender de CSS extra)
  const page = {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0b56b7 0%, #083c83 100%)",
    padding: 24,
    fontFamily: "Lexend, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  };
  const card = {
    maxWidth: 1100,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
  };
  const h1 = { margin: 0, fontSize: 40, fontWeight: 800 };
  const row = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" };
  const label = { fontWeight: 700 };
  const select = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cfd8ea",
    outline: "none",
    background: "white",
    fontWeight: 600,
  };
  const btnPrimary = {
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid #0b56b7",
    background: "#0b56b7",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  };
  const btnOutline = {
    padding: "10px 16px",
    borderRadius: 12,
    border: "2px solid #0b56b7",
    background: "#fff",
    color: "#0b56b7",
    fontWeight: 800,
    cursor: "pointer",
  };
  const btnSoft = {
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid #cfd8ea",
    background: "#f6f8ff",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
  };
  const chip = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#eef4ff",
    border: "1px solid #cfe0ff",
    fontWeight: 700,
    fontSize: 13,
  };
  const msgOk = {
    padding: "12px 14px",
    borderRadius: 12,
    background: "#eafff1",
    border: "1px solid #97e7b4",
    fontWeight: 700,
    marginTop: 12,
  };
  const msgErr = {
    padding: "12px 14px",
    borderRadius: 12,
    background: "#ffecec",
    border: "1px solid #ffb5b5",
    fontWeight: 800,
    marginTop: 12,
  };
  const textarea = {
    width: "100%",
    minHeight: 380,
    borderRadius: 14,
    border: "1px solid #cfd8ea",
    padding: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 13,
    outline: "none",
    background: "#fbfcff",
  };

  if (!logged) {
    return (
      <div style={page}>
        <div style={{ ...card, maxWidth: 650 }}>
          <h1 style={h1}>Admin — Control Acceso CARC</h1>
          <p style={{ marginTop: 8, fontWeight: 600, opacity: 0.8 }}>
            Ingresá la clave de administrador.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              doLogin();
            }}
            style={{ marginTop: 16 }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Clave admin"
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cfd8ea",
                  fontWeight: 700,
                  outline: "none",
                }}
                autoFocus
              />
              <button type="submit" style={btnPrimary}>
                Entrar
              </button>
            </div>
          </form>

          {errorMsg ? <div style={msgErr}>❌ {errorMsg}</div> : null}
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
            Ruta: <b>/admin</b>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={h1}>Admin — Control Acceso CARC</h1>
          <button onClick={logout} style={btnSoft}>
            Salir
          </button>
        </div>

        <div style={{ marginTop: 18, ...row }}>
          <div style={label}>Modo de carga:</div>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={select}>
            <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
            <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
          </select>

          <button onClick={guardarListado} style={btnPrimary}>
            Guardar listado
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            style={btnOutline}
          >
            Seleccionar CSV
          </button>

          <button onClick={clearCsv} style={btnSoft}>
            Limpiar CSV
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPickCsv}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ marginTop: 14, fontWeight: 700 }}>
          {csvInfo.name ? (
            <>
              CSV cargado: <b>{csvInfo.name}</b> — Filas: <b>{csvInfo.total}</b> — Válidas (con DNI):{" "}
              <b>{csvInfo.valid}</b>
            </>
          ) : (
            <span style={{ opacity: 0.8 }}>Todavía no cargaste CSV.</span>
          )}
        </div>

        {csvInfo.headers?.length ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ ...label, marginBottom: 6 }}>Encabezados detectados:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {csvInfo.headers.map((h, i) => (
                <span key={i} style={chip}>
                  {h || "(vacío)"}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {statusMsg ? <div style={msgOk}>✅ {statusMsg}</div> : null}
        {errorMsg ? <div style={msgErr}>❌ {errorMsg}</div> : null}

        <div style={{ marginTop: 18, fontWeight: 900, fontSize: 18 }}>
          Listado (JSON) — si cargás CSV se completa solo:
        </div>

        <div style={{ marginTop: 10 }}>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            style={textarea}
            spellCheck={false}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          <div>
            <b>Formato CSV recomendado (encabezados):</b>{" "}
            <span style={chip}>{recommendedHeaders}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <b>cuota:</b> 1 = al día, 0 = debe cuota.
          </div>
          <div style={{ marginTop: 6 }}>
            Ruta: <b>/admin</b>
          </div>
        </div>
      </div>
    </div>
  );
}
