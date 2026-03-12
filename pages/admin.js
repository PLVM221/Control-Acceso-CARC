import { useEffect, useRef, useState } from "react";

function normalizeDni(dni) {
  return String(dni ?? "").trim().replace(/\D/g, "");
}

function to01(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "0" || s === "no" || s.includes("debe")) return 0;
  return 1;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseSemicolonCSV(text) {
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

    if (!inQuotes && ch === ";") {
      row.push(cur);
      cur = "";
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

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows
    .map((r) => r.map((x) => String(x ?? "").trim()))
    .filter((r) => r.some((x) => x !== ""));
}

function parseGenericCSV(text) {
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
    if (!inQuotes && ch === sep) {
      row.push(cur);
      cur = "";
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
    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  const cleaned = rows
    .map((r) => r.map((x) => String(x ?? "").trim()))
    .filter((r) => r.some((x) => x !== ""));

  if (cleaned.length < 2) return { headers: [], rows: [] };

  return {
    headers: cleaned[0],
    rows: cleaned.slice(1),
  };
}

// CLEVER fijo:
// col 3 = nombre
// col 4 = dni
// col 14 = nombre ubicación
// col 16 = tipo ingreso
// col 19 = cuota
function parseCleverPersons(text) {
  const rows = parseSemicolonCSV(text);
  if (rows.length < 2) return { headers: [], items: [] };

  const headers = rows[0];
  const data = rows.slice(1);

  const items = [];
  for (const r of data) {
    const dni = normalizeDni(r[3]); // col 4
    if (!dni) continue;

    items.push({
      dni,
      nombre: String(r[2] ?? "").trim(),        // col 3
      tipoIngreso: String(r[15] ?? "").trim(),  // col 16
      ubicacion: String(r[13] ?? "").trim(),    // col 14
      cuota: to01(r[18]),                       // col 19
    });
  }

  const map = new Map();
  for (const p of items) map.set(p.dni, p);

  return {
    headers,
    items: Array.from(map.values()),
  };
}

// DEPORTICK fijo:
// col 1 = dni
// col 8 = nombre
// col 6 = tipo ingreso
// col 7 = sector/ubicación
// cuota = 1 fijo
function parseDeportickPersons(text) {
  const { headers, rows } = parseGenericCSV(text);
  if (!headers.length || !rows.length) return { headers: [], items: [] };

  const items = [];
  for (const r of rows) {
    const dni = normalizeDni(r[0]); // col 1
    if (!dni) continue;

    items.push({
      dni,
      nombre: String(r[7] ?? "").trim(),       // col 8
      tipoIngreso: String(r[5] ?? "").trim(),  // col 6
      ubicacion: String(r[6] ?? "").trim(),    // col 7
      cuota: 1,
    });
  }

  const map = new Map();
  for (const p of items) map.set(p.dni, p);

  return {
    headers,
    items: Array.from(map.values()),
  };
}

function guessMapping(headers) {
  const norm = (h) => h.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
  const find = (keys) => {
    const idx = headers.findIndex((h) => keys.some((k) => norm(h).includes(k)));
    return idx >= 0 ? headers[idx] : "";
  };

  return {
    dni: find(["dni", "documento", "doc"]),
    nombre: find(["nombre", "apellidoynombre", "apellido"]),
    tipoIngreso: find(["tipoingreso", "tipodeingreso", "tipo", "sector", "categoria"]),
    ubicacion: find(["ubicacion", "ubicación", "sector", "lugar"]),
  };
}

function buildPersonsFromMapping({ headers, rows, mapping, cuotaFija1 }) {
  const idx = (hname) => (hname ? headers.indexOf(hname) : -1);

  const iDni = idx(mapping.dni);
  const iNom = idx(mapping.nombre);
  const iTip = idx(mapping.tipoIngreso);
  const iUbi = idx(mapping.ubicacion);

  const out = [];
  for (const r of rows) {
    const dni = normalizeDni(iDni >= 0 ? r[iDni] : "");
    if (!dni) continue;

    out.push({
      dni,
      nombre: iNom >= 0 ? String(r[iNom] ?? "").trim() : "",
      tipoIngreso: iTip >= 0 ? String(r[iTip] ?? "").trim() : "",
      ubicacion: iUbi >= 0 ? String(r[iUbi] ?? "").trim() : "",
      cuota: cuotaFija1 ? 1 : 1,
    });
  }

  const map = new Map();
  for (const p of out) map.set(p.dni, p);
  return Array.from(map.values());
}

export default function AdminPage() {
  const fileAb = useRef(null);
  const fileVe = useRef(null);
  const fileLi = useRef(null);

  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);
  const [mode, setMode] = useState("NUEVO");

  const [abonados, setAbonados] = useState({ file: null, headers: [], items: [], valid: 0 });
  const [venta, setVenta] = useState({ file: null, headers: [], items: [], valid: 0 });
  const [listado, setListado] = useState({ file: null, headers: [], rows: [], mapping: {}, items: [], valid: 0 });

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(null);

  function doLogin() {
    setErrorMsg("");
    if (!password.trim()) return setErrorMsg("Ingresá la contraseña.");
    setLogged(true);
    setStatusMsg("Logueado ✅");
  }

  function logout() {
    setLogged(false);
    setPassword("");
    setStatusMsg("");
    setErrorMsg("");
    setProgress(null);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && !logged) doLogin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logged, password]);

  async function loadClever(file) {
    const text = await file.text();
    const { headers, items } = parseCleverPersons(text);

    setAbonados({
      file,
      headers,
      items,
      valid: items.length,
    });

    setStatusMsg(`Clever cargado: ${file.name} — Válidas: ${items.length}`);
    setErrorMsg("");
  }

  async function loadDeportick(file) {

  let rows = [];

  if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  } else {

    const text = await file.text();
    const parsed = parseGenericCSV(text);
    rows = [parsed.headers, ...parsed.rows];

  }

  if (rows.length < 2) return;

  const dataRows = rows.slice(1);

  const items = [];

  for (const r of dataRows) {

    const dni = normalizeDni(r[0]); // columna 1
    if (!dni) continue;

    items.push({
      dni,
      nombre: String(r[7] ?? "").trim(),       // columna 8
      tipoIngreso: String(r[5] ?? "").trim(),  // columna 6
      ubicacion: String(r[6] ?? "").trim(),    // columna 7
      cuota: 1
    });

  }

  const map = new Map();
  for (const p of items) map.set(p.dni, p);

  const final = Array.from(map.values());

  setVenta({
    file,
    headers: [],
    items: final,
    valid: final.length
  });

  setStatusMsg(`Deportick cargado: ${file.name} — Válidas: ${final.length}`);
  setErrorMsg("");
}

  async function loadListado(file) {
    const text = await file.text();
    const { headers, rows } = parseGenericCSV(text);
    const mapping = guessMapping(headers);
    const items = buildPersonsFromMapping({
      headers,
      rows,
      mapping,
      cuotaFija1: true,
    });

    setListado({
      file,
      headers,
      rows,
      mapping,
      items,
      valid: items.length,
    });

    setStatusMsg(`Listado cargado: ${file.name} — Válidas: ${items.length}`);
    setErrorMsg("");
  }

  function updateMappingListado(key, value) {
    const mapping = { ...listado.mapping, [key]: value };
    const items = buildPersonsFromMapping({
      headers: listado.headers,
      rows: listado.rows,
      mapping,
      cuotaFija1: true,
    });

    setListado((prev) => ({
      ...prev,
      mapping,
      items,
      valid: items.length,
    }));
  }

  function clearSource(source) {
    if (source === "abonados") {
      setAbonados({ file: null, headers: [], items: [], valid: 0 });
      if (fileAb.current) fileAb.current.value = "";
    }
    if (source === "venta") {
      setVenta({ file: null, headers: [], items: [], valid: 0 });
      if (fileVe.current) fileVe.current.value = "";
    }
    if (source === "listado") {
      setListado({ file: null, headers: [], rows: [], mapping: {}, items: [], valid: 0 });
      if (fileLi.current) fileLi.current.value = "";
    }
  }

  async function postImport({ source, clear, persons }) {
    const res = await fetch("/api/admin/importar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password,
        mode,
        source,
        clear: !!clear,
        persons,
      }),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(`Error ${res.status}: ${data.detail || data.error || text.slice(0, 200)}`);
    }

    return data;
  }

  async function importarFuente(source) {
    setErrorMsg("");
    setStatusMsg("");
    setProgress(null);

    const st =
      source === "abonados" ? abonados :
      source === "venta" ? venta :
      listado;

    if (!st.items || st.items.length === 0) {
      return setErrorMsg(`No hay datos cargados en ${source}.`);
    }

    const BATCH = 500;
    const chunks = chunkArray(st.items, BATCH);

    try {
      if (mode === "NUEVO") {
        setStatusMsg(`Limpiando base e importando ${source}...`);
        await postImport({ source, clear: true, persons: [] });
      }

      let done = 0;
      setProgress({ done: 0, total: st.items.length, label: `Importando ${source}...` });

      for (const batch of chunks) {
        await postImport({ source, clear: false, persons: batch });
        done += batch.length;
        setProgress({ done, total: st.items.length, label: `Importando ${source}...` });
      }

      setStatusMsg(`✅ Importación OK: ${source} — ${st.items.length} registros`);
    } catch (e) {
      setErrorMsg(e.message || String(e));
    }
  }

  const CardClever = () => (
    <div style={S.sourceCard}>
      <div style={S.sourceHeader}>
        <div style={S.sourceTitle}>
          <span style={S.icon}>🎟️</span>
          <div>
            <div style={S.sourceName}>Abonados (Cleversoft)</div>
            <div style={S.sourceHint}>Toma el archivo tal cual viene, sin modificarlo.</div>
          </div>
        </div>

        <div style={S.sourceActions}>
          <label style={S.btnOutline}>
            Seleccionar CSV
            <input
              ref={fileAb}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadClever(f);
              }}
            />
          </label>
          <button style={S.btnOutline} onClick={() => clearSource("abonados")}>Limpiar</button>
          <button style={S.btnPrimary} onClick={() => importarFuente("abonados")}>Importar</button>
        </div>
      </div>

      <div style={S.sourceBody}>
        <div style={S.badges}>
          <span style={S.badge}>Archivo: <b>{abonados.file ? abonados.file.name : "—"}</b></span>
          <span style={S.badge}>Válidas: <b>{abonados.valid}</b></span>
        </div>

        <div style={S.fixedMap}>
          <div><b>DNI</b> → columna 4</div>
          <div><b>Nombre</b> → columna 3</div>
          <div><b>Tipo ingreso</b> → columna 16</div>
          <div><b>Ubicación</b> → columna 14</div>
          <div><b>Cuota</b> → columna 19</div>
          <div><b>Puerta acceso</b> → no se usa</div>
        </div>
      </div>
    </div>
  );

  const CardDeportick = () => (
    <div style={S.sourceCard}>
      <div style={S.sourceHeader}>
        <div style={S.sourceTitle}>
          <span style={S.icon}>🧾</span>
          <div>
            <div style={S.sourceName}>Venta (Deportick)</div>
            <div style={S.sourceHint}>Todos quedan habilitados. Toma el archivo automáticamente.</div>
          </div>
        </div>

        <div style={S.sourceActions}>
          <label style={S.btnOutline}>
            Seleccionar CSV
            <input
              ref={fileVe}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadDeportick(f);
              }}
            />
          </label>
          <button style={S.btnOutline} onClick={() => clearSource("venta")}>Limpiar</button>
          <button style={S.btnPrimary} onClick={() => importarFuente("venta")}>Importar</button>
        </div>
      </div>

      <div style={S.sourceBody}>
        <div style={S.badges}>
          <span style={S.badge}>Archivo: <b>{venta.file ? venta.file.name : "—"}</b></span>
          <span style={S.badge}>Válidas: <b>{venta.valid}</b></span>
        </div>

        <div style={S.fixedMap}>
          <div><b>DNI</b> → columna 1</div>
          <div><b>Nombre</b> → columna 8</div>
          <div><b>Tipo ingreso</b> → columna 6</div>
          <div><b>Ubicación / Sector</b> → columna 7</div>
          <div><b>Cuota</b> → fija en 1</div>
          <div><b>Puerta acceso</b> → no se usa</div>
        </div>
      </div>
    </div>
  );

  const CardListado = () => (
    <div style={S.sourceCard}>
      <div style={S.sourceHeader}>
        <div style={S.sourceTitle}>
          <span style={S.icon}>📋</span>
          <div>
            <div style={S.sourceName}>Listado</div>
            <div style={S.sourceHint}>Cuota fija = 1 (al día)</div>
          </div>
        </div>

        <div style={S.sourceActions}>
          <label style={S.btnOutline}>
            Seleccionar CSV
            <input
              ref={fileLi}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadListado(f);
              }}
            />
          </label>
          <button style={S.btnOutline} onClick={() => clearSource("listado")}>Limpiar</button>
          <button style={S.btnPrimary} onClick={() => importarFuente("listado")}>Importar</button>
        </div>
      </div>

      <div style={S.sourceBody}>
        <div style={S.badges}>
          <span style={S.badge}>Archivo: <b>{listado.file ? listado.file.name : "—"}</b></span>
          <span style={S.badge}>Válidas: <b>{listado.valid}</b></span>
        </div>

        {listado.headers?.length ? (
          <div style={S.mappingGrid}>
            <MapSelect label="DNI" value={listado.mapping.dni || ""} headers={listado.headers} onChange={(v)=>updateMappingListado("dni",v)} />
            <MapSelect label="Nombre" value={listado.mapping.nombre || ""} headers={listado.headers} onChange={(v)=>updateMappingListado("nombre",v)} />
            <MapSelect label="Tipo ingreso" value={listado.mapping.tipoIngreso || ""} headers={listado.headers} onChange={(v)=>updateMappingListado("tipoIngreso",v)} />
            <MapSelect label="Ubicación" value={listado.mapping.ubicacion || ""} headers={listado.headers} onChange={(v)=>updateMappingListado("ubicacion",v)} />
          </div>
        ) : (
          <div style={S.placeholder}>Cargá un CSV para ver el mapeo.</div>
        )}
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.cardWide}>
        <div style={S.topRow}>
          <h1 style={S.h1}>Admin — Control Acceso CARC</h1>
          <button style={S.btnGhost} onClick={logout}>Salir</button>
        </div>

        {!logged ? (
          <div style={S.loginCard}>
            <div style={S.label}>Contraseña</div>
            <div style={S.row}>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresá la clave"
              />
              <button style={S.btnPrimary} onClick={doLogin}>Entrar</button>
            </div>
            <div style={S.mini}>Tip: podés entrar con Enter.</div>
            {errorMsg ? <div style={S.err}>❌ {errorMsg}</div> : null}
            {statusMsg ? <div style={S.ok}>✅ {statusMsg}</div> : null}
          </div>
        ) : (
          <>
            <div style={S.modeRow}>
              <div style={S.label}>Modo de carga:</div>
              <select style={S.select} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="NUEVO">NUEVO (borra y carga de cero)</option>
                <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
              </select>
            </div>

            {progress ? (
              <div style={S.progress}>
                <b>{progress.label}</b> {progress.done}/{progress.total}
              </div>
            ) : null}

            {errorMsg ? <div style={S.err}>❌ {errorMsg}</div> : null}
            {statusMsg ? <div style={S.ok}>✅ {statusMsg}</div> : null}

            <div style={S.grid}>
              <CardClever />
              <CardDeportick />
              <CardListado />
            </div>

            <div style={S.footer}>Ruta: <b>/admin</b></div>
          </>
        )}
      </div>
    </div>
  );
}

function MapSelect({ label, value, headers, onChange }) {
  return (
    <div style={S.mapBox}>
      <div style={S.mapLabel}>{label}</div>
      <select style={S.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— (sin usar)</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#0b4aa8,#07357b)",
    padding: 22,
    fontFamily:
      'Lexend, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  cardWide: {
    maxWidth: 1150,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  h1: { margin: 0, fontSize: 38, fontWeight: 900 },
  loginCard: { marginTop: 14, padding: 16, borderRadius: 18, border: "1px solid #e6e6e6", background: "#fafcff" },
  label: { fontWeight: 900, marginBottom: 6 },
  mini: { marginTop: 6, color: "#666", fontSize: 13 },
  row: { display: "flex", gap: 10, alignItems: "center" },
  input: { flex: 1, borderRadius: 12, border: "1px solid #cfd8e3", padding: "12px 14px", fontSize: 16 },
  select: { borderRadius: 12, border: "1px solid #cfd8e3", padding: "10px 12px", fontSize: 14, fontWeight: 700 },
  btnPrimary: { border: "none", background: "#0b4aa8", color: "#fff", padding: "12px 16px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  btnOutline: { border: "2px solid #0b4aa8", background: "#fff", color: "#0b4aa8", padding: "10px 14px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  btnGhost: { border: "1px solid #cfd8e3", background: "#f7f9fc", padding: "10px 14px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },

  ok: { marginTop: 12, padding: 12, background: "#e9fff0", border: "1px solid #b9ffd0", borderRadius: 14, fontWeight: 900 },
  err: { marginTop: 12, padding: 12, background: "#ffe9e9", border: "1px solid #ffb9b9", borderRadius: 14, fontWeight: 900 },

  modeRow: { marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  progress: { marginTop: 12, padding: 10, background: "#fff8e6", border: "1px solid #ffe0a3", borderRadius: 14, fontWeight: 900 },

  grid: { marginTop: 14, display: "grid", gridTemplateColumns: "1fr", gap: 14 },
  sourceCard: { border: "1px solid #e6eefc", background: "#f8fbff", borderRadius: 18, padding: 14 },
  sourceHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  sourceTitle: { display: "flex", gap: 12, alignItems: "center" },
  icon: { fontSize: 26 },
  sourceName: { fontSize: 18, fontWeight: 900 },
  sourceHint: { fontSize: 13, color: "#555" },
  sourceActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  sourceBody: { marginTop: 12 },
  badges: { display: "flex", gap: 8, flexWrap: "wrap" },
  badge: { background: "#fff", border: "1px solid #d7e6ff", padding: "6px 10px", borderRadius: 999, fontSize: 13 },

  fixedMap: { marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontWeight: 700 },
  mappingGrid: { marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 },
  mapBox: { background: "#fff", border: "1px solid #d7e6ff", borderRadius: 14, padding: 10 },
  mapLabel: { fontWeight: 900, fontSize: 12, marginBottom: 6, color: "#0b4aa8" },

  placeholder: { marginTop: 10, padding: 12, borderRadius: 14, border: "1px dashed #cfd8e3", color: "#555", background: "#fff" },
  footer: { marginTop: 12, fontSize: 13, color: "#333" },
};
