import { useMemo, useState } from "react";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");

  const [view, setView] = useState("home"); // home | nueva | agregar | logs
  const [jsonText, setJsonText] = useState("[]");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [logs, setLogs] = useState([]);

  const [fileName, setFileName] = useState("");
  const [csvInfo, setCsvInfo] = useState({ rows: 0, ok: false });

  async function login() {
    setMsg("");
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const j = await r.json();
    if (!j.ok) return setMsg(j.error || "Error");
    setToken(j.token);
    setMsg("✅ Logueado");
  }

  // ---------- CSV PARSER (simple y robusto para CSV normal) ----------
  function parseCSV(text) {
    // Soporta comillas, comas y saltos de línea dentro de comillas
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"' && inQuotes && next === '"') {
        cur += '"'; // doble comilla dentro de comillas
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (c === "," && !inQuotes) {
        row.push(cur);
        cur = "";
        continue;
      }

      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++; // CRLF
        row.push(cur);
        cur = "";
        if (row.some((x) => String(x).trim() !== "")) rows.push(row);
        row = [];
        continue;
      }

      cur += c;
    }

    // última celda
    row.push(cur);
    if (row.some((x) => String(x).trim() !== "")) rows.push(row);

    return rows;
  }

  function normalizeHeader(h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "");
  }

  function csvRowsToPersonas(rows) {
    if (!rows.length) return [];

    const header = rows[0].map(normalizeHeader);

    // Mapeo flexible de columnas
    const idx = (names) => {
      for (const n of names) {
        const i = header.indexOf(normalizeHeader(n));
        if (i >= 0) return i;
      }
      return -1;
    };

    const iDni = idx(["dni", "documento", "doc"]);
    const iNombre = idx(["nombre", "apellidoNombre", "apellidoynombre", "apellidonombre"]);
    const iTipo = idx(["tipoingreso", "tipo", "sector"]);
    const iPuerta = idx(["puertaacceso", "puerta", "acceso"]);
    const iUbic = idx(["ubicacion", "ubicación", "lugar"]);
    const iCuota = idx(["cuota", "cuotaaldia", "estadoCuota", "cuotaestado"]);

    if (iDni === -1 || iNombre === -1) {
      throw new Error(
        "El CSV debe tener al menos columnas DNI y Nombre (encabezados: dni,nombre,...)."
      );
    }

    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const line = rows[r];

      const dni = String(line[iDni] ?? "").replace(/\D/g, "");
      const nombre = String(line[iNombre] ?? "").trim();

      if (!dni || !nombre) continue;

      const tipoIngreso = iTipo >= 0 ? String(line[iTipo] ?? "").trim() : "";
      const puertaAcceso = iPuerta >= 0 ? String(line[iPuerta] ?? "").trim() : "";
      const ubicacion = iUbic >= 0 ? String(line[iUbic] ?? "").trim() : "";

      let cuota = 1;
      if (iCuota >= 0) {
        const raw = String(line[iCuota] ?? "").trim().toLowerCase();
        // aceptamos 1/0 o "si/no" o "aldia/debe"
        if (raw === "0" || raw === "debe" || raw === "impaga" || raw === "no") cuota = 0;
        else if (raw === "1" || raw === "aldia" || raw === "al dia" || raw === "sí" || raw === "si") cuota = 1;
        else {
          const n = Number(raw);
          if (!Number.isNaN(n)) cuota = n === 0 ? 0 : 1;
        }
      }

      out.push({
        dni,
        nombre,
        tipoIngreso,
        puertaAcceso,
        ubicacion,
        cuota,
      });
    }

    return out;
  }

  async function subirPersonas(modo, personas) {
    setMsg("");
    const r = await fetch("/api/admin/personas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ modo, personas }),
    });

    const j = await r.json();
    if (!j.ok) {
      setMsg(j.error || "Error");
      return;
    }

    setMsg(`✅ OK. Cargadas: ${personas.length}. Total en base: ${j.total ?? "?"}`);
  }

  async function subirDesdeTextarea(modo) {
    let personas;
    try {
      personas = JSON.parse(jsonText);
    } catch {
      setMsg("❌ JSON inválido");
      return;
    }
    if (!Array.isArray(personas)) {
      setMsg("❌ El JSON debe ser un array: [...]");
      return;
    }
    await subirPersonas(modo, personas);
  }

  async function handleFileChange(e) {
    setMsg("");
    setCsvInfo({ rows: 0, ok: false });

    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const text = await file.text();
    try {
      const rows = parseCSV(text);
      const personas = csvRowsToPersonas(rows);
      setCsvInfo({ rows: personas.length, ok: true });

      // guardamos en jsonText para inspección opcional (y para subir)
      setJsonText(JSON.stringify(personas, null, 2));
      setMsg(`✅ CSV leído: ${personas.length} filas válidas.`);
    } catch (err) {
      setCsvInfo({ rows: 0, ok: false });
      setMsg(`❌ Error CSV: ${err.message}`);
    }
  }

  async function cargarLogs() {
    setMsg("");
    const qs = new URLSearchParams({ from, to });
    const r = await fetch(`/api/admin/logs?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!j.ok) return setMsg(j.error || "Error");
    setLogs(j.logs || []);
    setMsg(`✅ Logs: ${j.logs?.length || 0}`);
  }

  function descargarLogs() {
    const qs = new URLSearchParams({ from, to, download: "1" });
    window.open(`/api/admin/logs?${qs.toString()}`, "_blank");
  }

  const Tile = ({ icon, title, desc, onClick }) => (
    <button onClick={onClick} style={styles.tile}>
      <div style={styles.tileIcon}>{icon}</div>
      <div style={{ textAlign: "left" }}>
        <div style={styles.tileTitle}>{title}</div>
        <div style={styles.tileDesc}>{desc}</div>
      </div>
    </button>
  );

  const Uploader = ({ modo }) => (
    <div style={styles.box}>
      <h2 style={{ marginTop: 0 }}>
        {modo === "REEMPLAZAR" ? "🆕 Nueva base (REEMPLAZAR)" : "➕ Agregar datos (AGREGAR)"}
      </h2>

      <div style={styles.help}>
        Subí un <b>CSV</b> con encabezados:
        <div style={{ marginTop: 6 }}>
          <code>dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota</code>
        </div>
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          Solo obligatorias: <b>dni</b> y <b>nombre</b>. <br />
          cuota: <b>1</b> al día / <b>0</b> debe.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          style={{ maxWidth: 320 }}
        />

        {fileName ? <div style={{ fontWeight: 700 }}>📄 {fileName}</div> : null}
        {csvInfo.ok ? <div style={{ fontWeight: 700 }}>✅ Filas: {csvInfo.rows}</div> : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button
          onClick={() => subirDesdeTextarea(modo)}
          style={modo === "REEMPLAZAR" ? styles.btnRed : styles.btnBlue}
          disabled={!csvInfo.ok || csvInfo.rows === 0}
          title={!csvInfo.ok ? "Primero cargá un CSV válido" : ""}
        >
          ⬆ Subir
        </button>

        <button onClick={() => setJsonText("[]")} style={styles.btnGray}>
          Vaciar
        </button>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Ver datos parseados (opcional)</summary>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          style={styles.textarea}
        />
      </details>
    </div>
  );

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={{ marginTop: 0 }}>Admin — Control Acceso CARC</h1>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="password"
              placeholder="Clave admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
            <button onClick={login} style={styles.btnYellow}>
              Entrar
            </button>
          </div>
          {msg && <div style={styles.msg}>{msg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.cardWide}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Panel Admin</h1>
          <button onClick={() => setView("home")} style={styles.btnBlue}>
            🏠 Inicio
          </button>
        </div>

        {view === "home" && (
          <>
            <div style={styles.tiles}>
              <Tile icon="🆕" title="Nueva base" desc="Reemplaza TODO el padrón" onClick={() => setView("nueva")} />
              <Tile icon="➕" title="Agregar datos" desc="Suma / actualiza por DNI" onClick={() => setView("agregar")} />
              <Tile icon="📜" title="Ver logs" desc="Búsquedas por fecha" onClick={() => setView("logs")} />
              <Tile icon="⬇️" title="Descargar logs" desc="CSV por rango de fechas" onClick={() => setView("logs")} />
            </div>

            <div style={styles.help}>
              ✅ Ahora podés subir CSV desde los botones (Nueva base / Agregar).
            </div>
          </>
        )}

        {view === "nueva" && <Uploader modo="REEMPLAZAR" />}
        {view === "agregar" && <Uploader modo="AGREGAR" />}

        {view === "logs" && (
          <div style={styles.box}>
            <h2 style={{ marginTop: 0 }}>📜 Logs por fechas</h2>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label>Desde:</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label>Hasta:</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <button onClick={cargarLogs} style={styles.btnBlue}>Ver</button>
              <button onClick={descargarLogs} style={styles.btnYellow}>⬇ Descargar CSV</button>
            </div>

            <div style={styles.logsBox}>
              {logs.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Sin logs cargados.</div>
              ) : (
                logs.map((l, idx) => (
                  <div
                    key={idx}
                    style={{
                      ...styles.logRow,
                      background: l.encontrado ? "#E9FFF0" : "#FFE2B5",
                    }}
                  >
                    <div><b>{new Date(l.ts).toLocaleString()}</b></div>
                    <div>
                      DNI: <b>{l.dni_buscado}</b> — {l.encontrado ? "✅ Encontrado" : "⛔ No existe"}
                    </div>
                    {l.encontrado ? (
                      <div style={{ opacity: 0.85 }}>
                        {l.nombre} • {l.tipo_ingreso} • {l.puerta_acceso} • Cuota:{" "}
                        {String(l.cuota) === "1" ? "Al día" : "Debe"}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {msg && <div style={styles.msg}>{msg}</div>}
        <div style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>Ruta: /admin</div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#0b4db3", padding: 18, fontFamily: "Lexend, system-ui" },
  card: { maxWidth: 520, margin: "0 auto", background: "#fff", borderRadius: 16, padding: 18 },
  cardWide: { maxWidth: 980, margin: "0 auto", background: "#fff", borderRadius: 16, padding: 18 },

  input: { padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 240 },

  btnYellow: { background: "#ffd100", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: "pointer" },
  btnBlue: { background: "#0b4db3", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: "pointer" },
  btnRed: { background: "#b00020", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 900, cursor: "pointer" },
  btnGray: { background: "#eee", border: "1px solid #ddd", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: "pointer" },

  msg: { marginTop: 12, background: "#f3f3f3", padding: 12, borderRadius: 12 },

  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 },
  tile: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    width: "100%",
    padding: 14,
    borderRadius: 14,
    border: "1px solid #eee",
    background: "#fafafa",
    cursor: "pointer",
  },
  tileIcon: { fontSize: 34, width: 46, textAlign: "center" },
  tileTitle: { fontWeight: 900, fontSize: 16 },
  tileDesc: { opacity: 0.75, fontSize: 13 },

  help: { marginTop: 12, background: "#f7f7f7", padding: 12, borderRadius: 12, fontSize: 13 },

  box: { marginTop: 14, border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fff" },
  textarea: {
    width: "100%",
    minHeight: 260,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #ccc",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  logsBox: { marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 10, maxHeight: 520, overflow: "auto" },
  logRow: { padding: 10, borderRadius: 10, marginBottom: 8, border: "1px solid #eee" },
};
