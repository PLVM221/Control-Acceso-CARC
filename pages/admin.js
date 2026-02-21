// pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

function toCuotaValue(v) {
  // acepta 1/0, "1"/"0", "SI"/"NO", "AL DIA"/"DEBE", etc.
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "0" || s === "no" || s.includes("debe")) return 0;
  return 1;
}

function parseCSV(text) {
  // Parser simple: detecta separador ( , ; \t ) y respeta comillas
  const sample = text.slice(0, 2000);
  const seps = [",", ";", "\t"];
  const sep = seps
    .map((c) => [c, (sample.match(new RegExp(`\\${c}`, "g")) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    if (!inQuotes && ch === sep) {
      row.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  // última fila
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  // elimina filas vacías
  const cleaned = rows
    .map((r) => r.map((x) => String(x ?? "").trim()))
    .filter((r) => r.some((x) => x !== ""));

  if (cleaned.length < 2) return { headers: [], items: [] };

  const headersRaw = cleaned[0].map((h) => h.trim());
  const norm = (h) =>
    h
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "");

  // map headers a tus nombres esperados
  const mapHeader = (h) => {
    const n = norm(h);
    if (n === "dni" || n === "documento") return "dni";
    if (n === "nombre" || n === "apellido" || n === "apellidoynombre")
      return "nombre";
    if (n === "tipoingreso" || n === "tipodeingreso" || n === "tipo")
      return "tipoIngreso";
    if (n === "puertaacceso" || n === "puerta" || n === "acceso")
      return "puertaAcceso";
    if (n === "ubicacion" || n === "ubicación") return "ubicacion";
    if (n === "cuota" || n === "cuotaaldia" || n === "estado") return "cuota";
    return null;
  };

  const mappedHeaders = headersRaw.map(mapHeader);

  const items = [];
  for (let i = 1; i < cleaned.length; i++) {
    const r = cleaned[i];
    const obj = {};
    for (let c = 0; c < mappedHeaders.length; c++) {
      const key = mappedHeaders[c];
      if (!key) continue;
      obj[key] = r[c];
    }

    const dni = normalizeDni(obj.dni);
    if (!dni) continue;

    items.push({
      dni,
      nombre: String(obj.nombre ?? "").trim(),
      tipoIngreso: String(obj.tipoIngreso ?? "").trim(),
      puertaAcceso: String(obj.puertaAcceso ?? "").trim(),
      ubicacion: String(obj.ubicacion ?? "").trim(),
      cuota: toCuotaValue(obj.cuota),
    });
  }

  return { headers: mappedHeaders.filter(Boolean), items };
}

export default function AdminPage() {
  const fileRef = useRef(null);

  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);

  const [mode, setMode] = useState("NUEVO"); // NUEVO | AGREGAR
  const [csvInfo, setCsvInfo] = useState(null);
  const [jsonText, setJsonText] = useState("[]");

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const parsedJson = useMemo(() => {
    try {
      const val = JSON.parse(jsonText || "[]");
      return Array.isArray(val) ? val : null;
    } catch {
      return null;
    }
  }, [jsonText]);

  function doLogin() {
    setErrorMsg("");
    if (!password.trim()) {
      setErrorMsg("Ingresá la contraseña.");
      return;
    }
    // login local simple
    setLogged(true);
    setStatusMsg("Logueado");
  }

  function logout() {
    setLogged(false);
    setPassword("");
    setStatusMsg("");
    setErrorMsg("");
  }

  async function onPickCSV(e) {
    setErrorMsg("");
    setStatusMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { headers, items } = parseCSV(text);

    setCsvInfo({
      name: file.name,
      totalRows: text.split(/\r?\n/).filter((l) => l.trim()).length - 1,
      headers,
      valid: items.length,
    });

    // ✅ llena el JSON automáticamente con lo parseado
    setJsonText(JSON.stringify(items, null, 2));
  }

  function clearCSV() {
    setCsvInfo(null);
    setJsonText("[]");
    setStatusMsg("");
    setErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function guardarListado() {
    setStatusMsg("");
    setErrorMsg("");

    if (!password.trim()) {
      setErrorMsg("Falta la contraseña (arriba).");
      return;
    }

    if (!parsedJson) {
      setErrorMsg("JSON inválido (debe ser un array).");
      return;
    }

    // ✅ limpia y dedup por DNI en el frontend también (para ahorrar payload)
    const map = new Map();
    for (const p of parsedJson) {
      const dni = normalizeDni(p?.dni);
      if (!dni) continue;

      map.set(dni, {
        dni,
        nombre: String(p?.nombre ?? "").trim(),
        tipoIngreso: String(p?.tipoIngreso ?? "").trim(),
        puertaAcceso: String(p?.puertaAcceso ?? "").trim(),
        ubicacion: String(p?.ubicacion ?? "").trim(),
        cuota: Number(p?.cuota) === 0 ? 0 : 1,
      });
    }
    const cleaned = Array.from(map.values());

    if (cleaned.length === 0) {
      setErrorMsg("No hay datos válidos para guardar (sin DNI).");
      return;
    }

    try {
      const res = await fetch("/api/admin/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          persons: cleaned,
          password,
        }),
      });

      // ✅ Lee texto primero (por si Vercel devuelve HTML en 413/504)
      const text = await res.text();

      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // no json
      }

      if (!res.ok) {
        const detail =
          (data && (data.detail || data.error)) ||
          text?.slice(0, 400) ||
          "Sin detalle";
        setErrorMsg(`Error ${res.status}: ${detail}`);
        return;
      }

      setStatusMsg(
        data?.guardadas
          ? `Guardado OK ✅ — válidas: ${data.validas} — guardadas: ${data.guardadas}`
          : "Guardado OK ✅"
      );
    } catch (err) {
      setErrorMsg(`Error de red: ${err?.message || String(err)}`);
    }
  }

  useEffect(() => {
    // Enter para login cuando NO está logueado
    const onKey = (e) => {
      if (e.key === "Enter" && !logged) doLogin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged, password]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <h1 style={styles.h1}>Admin — Control Acceso CARC</h1>
          {logged ? (
            <button style={styles.btnGhost} onClick={logout}>
              Salir
            </button>
          ) : null}
        </div>

        {!logged ? (
          <div style={styles.loginBox}>
            <label style={styles.label}>Contraseña</label>
            <div style={styles.row}>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresá la clave"
              />
              <button style={styles.btnPrimary} onClick={doLogin}>
                Entrar
              </button>
            </div>
            <div style={styles.miniNote}>Tip: podés entrar con Enter.</div>
          </div>
        ) : (
          <>
            <div style={styles.toolsRow}>
              <div style={styles.row}>
                <div style={styles.label}>Modo de carga:</div>
                <select
                  style={styles.select}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
                  <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
                </select>
              </div>

              <div style={styles.row}>
                <button style={styles.btnPrimary} onClick={guardarListado}>
                  Guardar listado
                </button>

                <label style={styles.btnOutline}>
                  Seleccionar CSV
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={onPickCSV}
                  />
                </label>

                <button style={styles.btnOutline} onClick={clearCSV}>
                  Limpiar CSV
                </button>
              </div>
            </div>

            {csvInfo ? (
              <div style={styles.infoBox}>
                <div>
                  <b>CSV cargado:</b> {csvInfo.name} — <b>Válidas (con DNI):</b>{" "}
                  {csvInfo.valid}
                </div>
                <div>
                  <b>Encabezados detectados:</b>{" "}
                  {csvInfo.headers?.length ? csvInfo.headers.join(", ") : "—"}
                </div>
              </div>
            ) : null}

            {errorMsg ? <div style={styles.errBox}>❌ {errorMsg}</div> : null}
            {statusMsg ? <div style={styles.okBox}>✅ {statusMsg}</div> : null}

            <div style={styles.sectionTitle}>
              Listado (JSON) — si cargás CSV se completa solo:
            </div>

            <textarea
              style={styles.textarea}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
            />

            <div style={styles.footerNote}>
              Formato CSV recomendado (encabezados):{" "}
              <code>dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota</code>
              <br />
              cuota: 1 = al día, 0 = debe cuota.
              <br />
              Ruta: <b>/admin</b>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: 24,
    background: "linear-gradient(180deg,#0b4aa8,#07357b)",
    fontFamily:
      'Lexend, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  card: {
    width: "min(1000px, 95vw)",
    background: "#fff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  headerRow: { display: "flex", justifyContent: "space-between", gap: 12 },
  h1: { margin: 0, fontSize: 36, fontWeight: 800 },
  loginBox: { marginTop: 18, padding: 16, border: "1px solid #e6e6e6", borderRadius: 16 },
  label: { fontWeight: 700, marginBottom: 6 },
  row: { display: "flex", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    borderRadius: 12,
    border: "1px solid #cfd8e3",
    padding: "12px 14px",
    fontSize: 16,
  },
  select: {
    borderRadius: 12,
    border: "1px solid #cfd8e3",
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 600,
  },
  toolsRow: { marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  btnPrimary: {
    border: "none",
    background: "#0b4aa8",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  btnOutline: {
    border: "2px solid #0b4aa8",
    background: "#fff",
    color: "#0b4aa8",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  btnGhost: {
    border: "1px solid #cfd8e3",
    background: "#f7f9fc",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  miniNote: { marginTop: 8, color: "#666", fontSize: 13 },
  infoBox: {
    marginTop: 14,
    padding: 12,
    background: "#f3f7ff",
    border: "1px solid #d7e6ff",
    borderRadius: 14,
    fontSize: 14,
  },
  errBox: {
    marginTop: 14,
    padding: 12,
    background: "#ffe9e9",
    border: "1px solid #ffb9b9",
    borderRadius: 14,
    fontWeight: 800,
  },
  okBox: {
    marginTop: 14,
    padding: 12,
    background: "#e9fff0",
    border: "1px solid #b9ffd0",
    borderRadius: 14,
    fontWeight: 800,
  },
  sectionTitle: { marginTop: 16, fontWeight: 900, fontSize: 16 },
  textarea: {
    width: "100%",
    minHeight: 380,
    marginTop: 10,
    borderRadius: 16,
    border: "1px solid #cfd8e3",
    padding: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    outline: "none",
  },
  footerNote: { marginTop: 12, fontSize: 13, color: "#333" },
};
