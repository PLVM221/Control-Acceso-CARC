// pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);

  const [mode, setMode] = useState("AGREGAR"); // "NUEVO" | "AGREGAR"
  const [jsonText, setJsonText] = useState(""); // vacío por defecto (lo que pediste)
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [csvName, setCsvName] = useState("");
  const [csvRows, setCsvRows] = useState(0);
  const [csvValid, setCsvValid] = useState(0);
  const [headers, setHeaders] = useState([]);

  const fileRef = useRef(null);

  function logout() {
    setLogged(false);
    setPassword("");
  }

  function onLogin(e) {
    e.preventDefault();
    // Login simple del lado cliente: solo habilita UI.
    // La API valida con ADMIN_PASSWORD igualmente.
    if (!password.trim()) return;
    setLogged(true);
  }

  function parseCSV(text) {
    // detecta separador simple ( , o ; )
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length);
    const sep = firstLine && firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) return { rows: [], headers: [] };

    const hdr = lines[0].split(sep).map((h) => h.trim());
    const out = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep);
      const obj = {};
      for (let j = 0; j < hdr.length; j++) obj[hdr[j]] = (cols[j] ?? "").trim();
      out.push(obj);
    }

    return { rows: out, headers: hdr };
  }

  function normalizeDni(dni) {
    return String(dni ?? "").replace(/[^\d]/g, "").trim();
  }

  function toInt01(v) {
    if (v === 0 || v === "0" || v === false || v === "false") return 0;
    return 1;
  }

  function mapCSVToPersons(rows, hdr) {
    // Esperados:
    // dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
    // (puede venir con mayúsculas o guiones)
    const key = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

    const cols = hdr.reduce((acc, h) => {
      acc[key(h)] = h;
      return acc;
    }, {});

    const colDni = cols["dni"];
    const colNombre = cols["nombre"];
    const colTipo = cols["tipoingreso"] || cols["tipo_ingreso"] || cols["tipo"];
    const colPuerta = cols["puertaacceso"] || cols["puerta_acceso"] || cols["puerta"];
    const colUbic = cols["ubicacion"];
    const colCuota = cols["cuota"];

    const persons = [];
    let valid = 0;

    for (const r of rows) {
      const dni = normalizeDni(colDni ? r[colDni] : "");
      if (!dni) continue;

      const nombre = String(colNombre ? r[colNombre] : "").trim();
      if (!nombre) continue;

      valid++;

      persons.push({
        dni,
        nombre,
        tipoIngreso: String(colTipo ? r[colTipo] : "").trim() || "",
        puertaAcceso: String(colPuerta ? r[colPuerta] : "").trim() || "",
        ubicacion: String(colUbic ? r[colUbic] : "").trim() || "",
        cuota: toInt01(colCuota ? r[colCuota] : 1),
      });
    }

    return { persons, valid };
  }

  async function onFileChange(e) {
    setStatusMsg("");
    setErrorMsg("");

    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { rows, headers: hdr } = parseCSV(text);

    setCsvName(file.name);
    setCsvRows(rows.length);
    setHeaders(hdr);

    const { persons, valid } = mapCSVToPersons(rows, hdr);
    setCsvValid(valid);

    // Carga el JSON en el textarea automáticamente
    setJsonText(JSON.stringify(persons, null, 2));
    setStatusMsg(`CSV cargado: ${file.name} — Filas: ${rows.length} — Válidas (con DNI): ${valid}`);
  }

  function clearCSV() {
    setCsvName("");
    setCsvRows(0);
    setCsvValid(0);
    setHeaders([]);
    setStatusMsg("");
    setErrorMsg("");
    setJsonText("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function guardarListado() {
    setStatusMsg("");
    setErrorMsg("");

    let parsed;
    try {
      parsed = JSON.parse(jsonText || "[]");
    } catch {
      setErrorMsg("JSON inválido. Si usás CSV, seleccioná el archivo y se completa solo.");
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      setErrorMsg("No hay datos para guardar (CSV vacío o JSON inválido)");
      return;
    }

    try {
     const res = await fetch("/api/admin/guardar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    mode,
    persons: cleaned,   // 👈 ESTE es el correcto
    password
  }),
});

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(data?.detail ? `${data.error}: ${data.detail}` : (data?.error || "No se pudo guardar"));
        return;
      }

      setStatusMsg(`✅ Guardado OK — Modo: ${mode} — Guardados: ${data.saved}`);
    } catch (e) {
      setErrorMsg("Error de conexión con el servidor");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <h1 style={styles.h1}>Admin — Control Acceso CARC</h1>
          {logged && <button onClick={logout} style={styles.btnGhost}>Salir</button>}
        </div>

        {!logged ? (
          <form onSubmit={onLogin} style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="password"
                placeholder="Contraseña admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
              />
              <button type="submit" style={styles.btnPrimary}>
                Entrar
              </button>
            </div>
            <div style={{ marginTop: 8, color: "#333" }}>
              Tip: podés apretar <b>Enter</b> para ingresar.
            </div>
          </form>
        ) : (
          <>
            <div style={styles.row}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700 }}>Modo de carga:</div>
                <select value={mode} onChange={(e) => setMode(e.target.value)} style={styles.select}>
                  <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
                  <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
                </select>

                <button onClick={guardarListado} style={styles.btnPrimary}>
                  Guardar listado
                </button>

                <label style={styles.btnOutline}>
                  Seleccionar CSV
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={onFileChange}
                    style={{ display: "none" }}
                  />
                </label>

                <button onClick={clearCSV} style={styles.btnOutline}>
                  Limpiar CSV
                </button>
              </div>
            </div>

            {csvName && (
              <div style={styles.smallInfo}>
                <div>
                  <b>CSV cargado:</b> {csvName} — <b>Filas:</b> {csvRows} — <b>Válidas (con DNI):</b> {csvValid}
                </div>
                {headers?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <b>Encabezados detectados:</b>{" "}
                    {headers.map((h) => (
                      <span key={h} style={styles.badge}>{h}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {statusMsg && <div style={styles.okBox}>✅ {statusMsg}</div>}
            {errorMsg && <div style={styles.errBox}>❌ {errorMsg}</div>}

            <h3 style={styles.h3}>Listado (JSON) — si cargás CSV se completa solo:</h3>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={styles.textarea}
              placeholder='Pegá un JSON array: [{"dni":"123","nombre":"...","tipoIngreso":"...","puertaAcceso":"...","ubicacion":"...","cuota":1}]'
            />

            <div style={styles.footer}>
              <div><b>Formato CSV recomendado (encabezados):</b> <code>dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota</code></div>
              <div><b>cuota:</b> 1 = al día, 0 = debe cuota.</div>
              <div>Ruta: <code>/admin</code></div>
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
    background: "linear-gradient(#0B57D0, #0B57D0)",
    padding: 18,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  card: {
    maxWidth: 980,
    margin: "0 auto",
    background: "white",
    borderRadius: 18,
    padding: 22,
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  h1: { margin: 0, fontSize: 34 },
  h3: { marginTop: 18, marginBottom: 10 },
  row: { marginTop: 14, marginBottom: 12 },
  input: {
    width: 320,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #cfd7e6",
    fontSize: 16,
  },
  select: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cfd7e6",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    minHeight: 340,
    borderRadius: 12,
    border: "1px solid #cfd7e6",
    padding: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 14,
  },
  btnPrimary: {
    background: "#0B57D0",
    color: "white",
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
  btnOutline: {
    background: "white",
    border: "1px solid #0B57D0",
    color: "#0B57D0",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
  btnGhost: {
    background: "#f2f5fb",
    border: "1px solid #d6ddeb",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
  okBox: {
    marginTop: 12,
    padding: 12,
    background: "#E9FBEE",
    border: "1px solid #98E2A5",
    borderRadius: 12,
    fontWeight: 700,
  },
  errBox: {
    marginTop: 12,
    padding: 12,
    background: "#FFE9E9",
    border: "1px solid #FFB5B5",
    borderRadius: 12,
    fontWeight: 700,
  },
  smallInfo: {
    marginTop: 12,
    padding: 12,
    background: "#f7f9ff",
    border: "1px solid #d9e3ff",
    borderRadius: 12,
  },
  badge: {
    display: "inline-block",
    marginLeft: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #d6ddeb",
    background: "#fff",
    fontSize: 12,
  },
  footer: { marginTop: 14, color: "#333", lineHeight: 1.6 },
};
