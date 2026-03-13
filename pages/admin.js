import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

const ADMIN_SESSION_KEY = "carc_admin_session_v1";
const ADMIN_PASSWORD_KEY = "carc_admin_password_v1";

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

function parseTipoIngresoMapCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const map = {};

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 2) continue;

    const nombre = String(parts[0] ?? "").trim();
    const id = String(parts[1] ?? "").trim();

    if (id) map[id] = nombre;
  }

  return map;
}

function parseCleverPersons(text) {
  const rows = parseSemicolonCSV(text);
  if (rows.length < 2) return { headers: [], items: [] };

  const headers = rows[0];
  const data = rows.slice(1);

  const items = [];
  for (const r of data) {
    const dni = normalizeDni(r[3]);
    if (!dni) continue;

    items.push({
      dni,
      nombre: String(r[2] ?? "").trim(),
      tipoIngreso: String(r[15] ?? "").trim(),
      ubicacion: String(r[13] ?? "").trim(),
      cuota: to01(r[18]),
    });
  }

  const map = new Map();
  for (const p of items) map.set(p.dni, p);

  return {
    headers,
    items: Array.from(map.values()),
  };
}

function parseDeportickPersonsFromRows(rows) {
  const items = [];

  for (const r of rows) {
    const dni = normalizeDni(r[0]);
    if (!dni) continue;

    items.push({
      dni,
      nombre: String(r[7] ?? "").trim(),
      tipoIngreso: String(r[5] ?? "").trim(),
      ubicacion: String(r[6] ?? "").trim(),
      cuota: 1,
    });
  }

  const map = new Map();
  for (const p of items) map.set(p.dni, p);

  return Array.from(map.values());
}

function parseListadoPersonsFixed(text, tiposIngresoMap) {
  const { headers, rows } = parseGenericCSV(text);
  if (!headers.length || !rows.length) return { headers: [], items: [] };

  const items = [];

  for (const r of rows) {
    const dni = normalizeDni(r[6]);
    if (!dni) continue;

    const idTipo = String(r[7] ?? "").trim();

    items.push({
      dni,
      nombre: String(r[2] ?? "").trim(),
      tipoIngreso: tiposIngresoMap[idTipo] || `ID ${idTipo}`,
      ubicacion: "LIBRE",
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

function getLogStyle(estado) {
  if (estado === "ok") {
    return {
      background: "#dcfce7",
      border: "1px solid #86efac",
      color: "#166534",
    };
  }

  if (estado === "denegado") {
    return {
      background: "#fef3c7",
      border: "1px solid #fcd34d",
      color: "#92400e",
    };
  }

  if (estado === "no_existe") {
    return {
      background: "#ffedd5",
      border: "1px solid #fdba74",
      color: "#9a3412",
    };
  }

  return {
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    color: "#991b1b",
  };
}

function formatLocalInput(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPage() {
  const fileMaster = useRef(null);
  const fileAb = useRef(null);
  const fileVe = useRef(null);
  const fileLi = useRef(null);

  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);
  const [mode, setMode] = useState("AGREGAR");

  const [tiposIngresoMap, setTiposIngresoMap] = useState({});
  const [tiposIngresoFile, setTiposIngresoFile] = useState(null);

  const [abonados, setAbonados] = useState({ file: null, headers: [], items: [], valid: 0 });
  const [venta, setVenta] = useState({ file: null, headers: [], items: [], valid: 0 });
  const [listado, setListado] = useState({ file: null, headers: [], items: [], valid: 0 });

  const [stats, setStats] = useState({
    personas: 0,
    fuentes: 0,
    cuotaDia: 0,
    deuda: 0,
    abonados: 0,
    venta: 0,
    listado: 0,
    ultimaActualizacion: null,
  });

  const [logs, setLogs] = useState([]);
  const [logDniFilter, setLogDniFilter] = useState("");
  const [logDesde, setLogDesde] = useState("");
  const [logHasta, setLogHasta] = useState("");

  const [partidos, setPartidos] = useState([]);
  const [partidoRival, setPartidoRival] = useState("");
  const [partidoFechaHora, setPartidoFechaHora] = useState("");
  const [partidoLogDesde, setPartidoLogDesde] = useState("");
  const [partidoLogHasta, setPartidoLogHasta] = useState("");

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    try {
      const savedSession = localStorage.getItem(ADMIN_SESSION_KEY);
      const savedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY);

      if (savedSession === "1" && savedPassword) {
        setPassword(savedPassword);
        setLogged(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!logged) return;
    loadStats();
    loadLogs();
    loadPartidos();
  }, [logged]);

  useEffect(() => {
    if (!logged) return;

    const id = setInterval(() => {
      loadLogs();
    }, 5000);

    return () => clearInterval(id);
  }, [logged, logDniFilter, logDesde, logHasta]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && !logged) doLogin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logged, password]);

  function doLogin() {
    setErrorMsg("");
    if (!password.trim()) return setErrorMsg("Ingresá la contraseña.");

    setLogged(true);
    setStatusMsg("Logueado ✅");

    try {
      localStorage.setItem(ADMIN_SESSION_KEY, "1");
      localStorage.setItem(ADMIN_PASSWORD_KEY, password);
    } catch {}
  }

  function logout() {
    setLogged(false);
    setPassword("");
    setStatusMsg("");
    setErrorMsg("");
    setProgress(null);

    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_PASSWORD_KEY);
    } catch {}
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (res.ok && data.ok) {
        setStats(data.stats);
      }
    } catch {}
  }

  async function loadLogs(dniOverride, desdeOverride, hastaOverride) {
    try {
      const dni = normalizeDni(
        dniOverride !== undefined ? dniOverride : logDniFilter
      );
      const desde = desdeOverride !== undefined ? desdeOverride : logDesde;
      const hasta = hastaOverride !== undefined ? hastaOverride : logHasta;

      const params = new URLSearchParams();
      params.set("limit", "120");
      if (dni) params.set("dni", dni);
      if (desde) params.set("desde", new Date(desde).toISOString());
      if (hasta) params.set("hasta", new Date(hasta).toISOString());

      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.ok) {
        setLogs(data.logs || []);
      }
    } catch {}
  }

  async function loadPartidos() {
    try {
      const res = await fetch("/api/admin/partidos");
      const data = await res.json();

      if (res.ok && data.ok) {
        setPartidos(data.partidos || []);
      }
    } catch {}
  }

  async function crearPartido() {
    setErrorMsg("");
    setStatusMsg("");

    if (!partidoRival.trim() || !partidoLogDesde || !partidoLogHasta) {
      setErrorMsg("Completá rival, desde y hasta.");
      return;
    }

    try {
      const res = await fetch("/api/admin/partidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          rival: partidoRival.trim(),
          fecha_hora_partido: partidoFechaHora ? new Date(partidoFechaHora).toISOString() : null,
          log_desde: new Date(partidoLogDesde).toISOString(),
          log_hasta: new Date(partidoLogHasta).toISOString(),
          activo: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "No se pudo guardar el partido");
      }

      setStatusMsg("✅ Partido guardado");
      setPartidoRival("");
      setPartidoFechaHora("");
      setPartidoLogDesde("");
      setPartidoLogHasta("");
      await loadPartidos();
    } catch (e) {
      setErrorMsg(e.message || String(e));
    }
  }

  async function borrarPartido(id) {
    const ok = confirm("¿Seguro que querés borrar este partido?");
    if (!ok) return;

    setErrorMsg("");
    setStatusMsg("");

    try {
      const res = await fetch("/api/admin/partidos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "No se pudo borrar el partido");
      }

      setStatusMsg("✅ Partido borrado");
      await loadPartidos();
    } catch (e) {
      setErrorMsg(e.message || String(e));
    }
  }

  function exportarLogsCsv() {
    const params = new URLSearchParams();
    if (logDniFilter) params.set("dni", normalizeDni(logDniFilter));
    if (logDesde) params.set("desde", new Date(logDesde).toISOString());
    if (logHasta) params.set("hasta", new Date(logHasta).toISOString());

    window.open(`/api/admin/export-logs?${params.toString()}`, "_blank");
  }

  async function loadTiposIngresoMaster(file) {
    const text = await file.text();
    const map = parseTipoIngresoMapCSV(text);
    setTiposIngresoMap(map);
    setTiposIngresoFile(file);
    setStatusMsg(`Maestro de tipos cargado: ${file.name} — IDs: ${Object.keys(map).length}`);
    setErrorMsg("");
  }

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
    const items = parseDeportickPersonsFromRows(dataRows);

    setVenta({
      file,
      headers: rows[0] || [],
      items,
      valid: items.length,
    });

    setStatusMsg(`Deportick cargado: ${file.name} — Válidas: ${items.length}`);
    setErrorMsg("");
  }

  async function loadListado(file) {
    if (!Object.keys(tiposIngresoMap).length) {
      setErrorMsg("Primero cargá el archivo maestro de tipos de ingreso.");
      return;
    }

    const text = await file.text();
    const { headers, items } = parseListadoPersonsFixed(text, tiposIngresoMap);

    setListado({
      file,
      headers,
      items,
      valid: items.length,
    });

    setStatusMsg(`Listado cargado: ${file.name} — Válidas: ${items.length}`);
    setErrorMsg("");
  }

  function clearSource(source) {
    if (source === "maestro") {
      setTiposIngresoMap({});
      setTiposIngresoFile(null);
      if (fileMaster.current) fileMaster.current.value = "";
    }
    if (source === "abonados") {
      setAbonados({ file: null, headers: [], items: [], valid: 0 });
      if (fileAb.current) fileAb.current.value = "";
    }
    if (source === "venta") {
      setVenta({ file: null, headers: [], items: [], valid: 0 });
      if (fileVe.current) fileVe.current.value = "";
    }
    if (source === "listado") {
      setListado({ file: null, headers: [], items: [], valid: 0 });
      if (fileLi.current) fileLi.current.value = "";
    }
  }

  async function postImport({ source, clear, persons }) {
    const res = await fetch("/api/admin/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      await loadStats();
    } catch (e) {
      setErrorMsg(e.message || String(e));
    }
  }

  async function borrarTodaBase() {
    const ok = confirm("¿Seguro que querés borrar TODA la base de accesos?");
    if (!ok) return;

    setErrorMsg("");
    setStatusMsg("");

    try {
      const res = await fetch("/api/admin/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "No se pudo borrar la base");
      }

      setStatusMsg("✅ Base completa borrada");
      await loadStats();
      await loadLogs();
    } catch (e) {
      setErrorMsg(e.message || String(e));
    }
  }

  const CardInfo = ({ title, value, subtitle }) => (
    <div style={S.statCard}>
      <div style={S.statTitle}>{title}</div>
      <div style={S.statValue}>{value}</div>
      <div style={S.statSub}>{subtitle}</div>
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
            <div style={S.mini}>Tip: podés entrar con Enter y recuerda la sesión en este navegador.</div>
            {errorMsg ? <div style={S.err}>❌ {errorMsg}</div> : null}
            {statusMsg ? <div style={S.ok}>✅ {statusMsg}</div> : null}
          </div>
        ) : (
          <>
            <div style={S.modeRow}>
              <div style={S.label}>Modo de carga:</div>
              <select style={S.select} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
                <option value="NUEVO">NUEVO (borra y carga de cero)</option>
              </select>

              <button style={S.btnOutline} onClick={loadStats}>Refrescar estadísticas</button>
              <button style={S.btnOutline} onClick={() => loadLogs()}>Refrescar logs</button>
              <button style={S.btnDanger} onClick={borrarTodaBase}>Borrar toda la base</button>
            </div>

            {progress ? (
              <div style={S.progress}>
                <b>{progress.label}</b> {progress.done}/{progress.total}
              </div>
            ) : null}

            {errorMsg ? <div style={S.err}>❌ {errorMsg}</div> : null}
            {statusMsg ? <div style={S.ok}>✅ {statusMsg}</div> : null}

            <div style={S.statsGrid}>
              <CardInfo title="Personas en base" value={stats.personas} subtitle="Tabla personas" />
              <CardInfo title="Fuentes cargadas" value={stats.fuentes} subtitle="Tabla persona_fuentes" />
              <CardInfo title="Cuota al día" value={stats.cuotaDia} subtitle="Acceso habilitado" />
              <CardInfo title="Debe cuota" value={stats.deuda} subtitle="Acceso con deuda" />
              <CardInfo title="Abonados" value={stats.abonados} subtitle="Fuente Clever" />
              <CardInfo title="Deportick" value={stats.venta} subtitle="Fuente venta" />
              <CardInfo title="Listado" value={stats.listado} subtitle="Fuente manual/listado" />
              <CardInfo
                title="Última actualización"
                value={stats.ultimaActualizacion ? new Date(stats.ultimaActualizacion).toLocaleString("es-AR") : "—"}
                subtitle="Último cambio en personas"
              />
            </div>

            <div style={S.partidosPanel}>
              <div style={S.sourceTitle}>
                <span style={S.icon}>🏟️</span>
                <div>
                  <div style={S.sourceName}>Configuración de partidos</div>
                  <div style={S.sourceHint}>Los logs se asignan automáticamente al partido activo según horario</div>
                </div>
              </div>

              <div style={S.partidoFormGrid}>
                <input
                  style={S.inputSmall}
                  value={partidoRival}
                  onChange={(e) => setPartidoRival(e.target.value)}
                  placeholder='Rosario Central vs. [completar rival]'
                />
                <input
                  style={S.inputSmall}
                  type="datetime-local"
                  value={partidoFechaHora}
                  onChange={(e) => setPartidoFechaHora(e.target.value)}
                />
                <input
                  style={S.inputSmall}
                  type="datetime-local"
                  value={partidoLogDesde}
                  onChange={(e) => setPartidoLogDesde(e.target.value)}
                />
                <input
                  style={S.inputSmall}
                  type="datetime-local"
                  value={partidoLogHasta}
                  onChange={(e) => setPartidoLogHasta(e.target.value)}
                />
                <button style={S.btnPrimary} onClick={crearPartido}>Guardar partido</button>
              </div>

              <div style={S.partidoLegend}>
                <span><b>Partido:</b> Rosario Central vs. {partidoRival || "..."}</span>
                <span><b>Campo 2:</b> fecha/hora del partido</span>
                <span><b>Campo 3:</b> desde cuándo grabar logs</span>
                <span><b>Campo 4:</b> hasta cuándo grabar logs</span>
              </div>

              <div style={S.partidosList}>
                {partidos.length === 0 ? (
                  <div style={{ color: "#666" }}>Todavía no hay partidos configurados.</div>
                ) : (
                  partidos.map((p) => (
                    <div key={p.id} style={S.partidoItem}>
                      <div>
                        <div style={{ fontWeight: 900 }}>Rosario Central vs. {p.rival}</div>
                        <div>Partido: {p.fecha_hora_partido ? new Date(p.fecha_hora_partido).toLocaleString("es-AR") : "—"}</div>
                        <div>Logs desde: {p.log_desde ? new Date(p.log_desde).toLocaleString("es-AR") : "—"}</div>
                        <div>Logs hasta: {p.log_hasta ? new Date(p.log_hasta).toLocaleString("es-AR") : "—"}</div>
                      </div>
                      <button style={S.btnDanger} onClick={() => borrarPartido(p.id)}>Borrar</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={S.logsPanel}>
              <div style={S.logsTop}>
                <div style={S.sourceTitle}>
                  <span style={S.icon}>📡</span>
                  <div>
                    <div style={S.sourceName}>Controles en vivo</div>
                    <div style={S.sourceHint}>Se actualiza cada 5 segundos y respeta el mismo color que ve el usuario</div>
                  </div>
                </div>

                <div style={S.logsFilters}>
                  <input
                    style={S.inputSmall}
                    type="text"
                    value={logDniFilter}
                    onChange={(e) => setLogDniFilter(normalizeDni(e.target.value))}
                    placeholder="Filtrar por DNI"
                  />
                  <input
                    style={S.inputSmall}
                    type="datetime-local"
                    value={logDesde}
                    onChange={(e) => setLogDesde(e.target.value)}
                  />
                  <input
                    style={S.inputSmall}
                    type="datetime-local"
                    value={logHasta}
                    onChange={(e) => setLogHasta(e.target.value)}
                  />
                  <button
                    style={S.btnOutline}
                    onClick={() => loadLogs(logDniFilter, logDesde, logHasta)}
                  >
                    Buscar
                  </button>
                  <button
                    style={S.btnOutline}
                    onClick={() => {
                      setLogDniFilter("");
                      setLogDesde("");
                      setLogHasta("");
                      loadLogs("", "", "");
                    }}
                  >
                    Limpiar filtro
                  </button>
                  <button style={S.btnPrimary} onClick={exportarLogsCsv}>
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div style={S.logsBox}>
                {logs.length === 0 ? (
                  <div style={{ color: "#666" }}>Todavía no hay controles registrados.</div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        ...S.logItem,
                        ...getLogStyle(log.estado),
                      }}
                    >
                      <div style={S.logMain}>
                        <div><b>DNI:</b> {log.dni_buscado || "—"}</div>
                        <div><b>Nombre:</b> {log.nombre || "—"}</div>
                        <div><b>Tipo:</b> {log.tipo_ingreso || "—"}</div>
                        <div><b>Ubicación:</b> {log.ubicacion || "—"}</div>
                        <div><b>Partido:</b> {log.partido || "—"}</div>
                      </div>

                      <div style={S.logSide}>
                        <div style={{ fontWeight: 900 }}>
                          {log.estado === "ok"
                            ? "ACCESO HABILITADO"
                            : log.estado === "denegado"
                            ? "CUOTA PENDIENTE"
                            : log.estado === "no_existe"
                            ? "DNI NO EXISTE"
                            : "ERROR"}
                        </div>
                        <div>{log.ts ? new Date(log.ts).toLocaleString("es-AR") : "—"}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={S.grid}>
              <div style={S.sourceCard}>
                <div style={S.sourceHeader}>
                  <div style={S.sourceTitle}>
                    <span style={S.icon}>🧩</span>
                    <div>
                      <div style={S.sourceName}>Maestro tipo de ingreso</div>
                      <div style={S.sourceHint}>Archivo de equivalencias ID → nombre</div>
                    </div>
                  </div>
                  <div style={S.sourceActions}>
                    <label style={S.btnOutline}>
                      Seleccionar CSV
                      <input
                        ref={fileMaster}
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) loadTiposIngresoMaster(f);
                        }}
                      />
                    </label>
                    <button
                      style={S.btnOutline}
                      onClick={() => {
                        const ok = confirm("¿Seguro que querés limpiar esta carga?");
                        if (ok) clearSource("maestro");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                <div style={S.badges}>
                  <span style={S.badge}>Archivo: <b>{tiposIngresoFile ? tiposIngresoFile.name : "—"}</b></span>
                  <span style={S.badge}>IDs cargados: <b>{Object.keys(tiposIngresoMap).length}</b></span>
                </div>
              </div>

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
                    <button
                      style={S.btnOutline}
                      onClick={() => {
                        const ok = confirm("¿Seguro que querés limpiar esta carga?");
                        if (ok) clearSource("abonados");
                      }}
                    >
                      Limpiar
                    </button>
                    <button style={S.btnPrimary} onClick={() => importarFuente("abonados")}>Importar</button>
                  </div>
                </div>

                <div style={S.badges}>
                  <span style={S.badge}>Archivo: <b>{abonados.file ? abonados.file.name : "—"}</b></span>
                  <span style={S.badge}>Cargados en panel: <b>{abonados.valid}</b></span>
                  <span style={S.badge}>Fuente en base: <b>{stats.abonados}</b></span>
                </div>
              </div>

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
                      Seleccionar archivo
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
                    <button
                      style={S.btnOutline}
                      onClick={() => {
                        const ok = confirm("¿Seguro que querés limpiar esta carga?");
                        if (ok) clearSource("venta");
                      }}
                    >
                      Limpiar
                    </button>
                    <button style={S.btnPrimary} onClick={() => importarFuente("venta")}>Importar</button>
                  </div>
                </div>

                <div style={S.badges}>
                  <span style={S.badge}>Archivo: <b>{venta.file ? venta.file.name : "—"}</b></span>
                  <span style={S.badge}>Cargados en panel: <b>{venta.valid}</b></span>
                  <span style={S.badge}>Fuente en base: <b>{stats.venta}</b></span>
                </div>
              </div>

              <div style={S.sourceCard}>
                <div style={S.sourceHeader}>
                  <div style={S.sourceTitle}>
                    <span style={S.icon}>📋</span>
                    <div>
                      <div style={S.sourceName}>Listado</div>
                      <div style={S.sourceHint}>Tipo ingreso por maestro, ubicación = LIBRE, cuota = 1.</div>
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
                    <button
                      style={S.btnOutline}
                      onClick={() => {
                        const ok = confirm("¿Seguro que querés limpiar esta carga?");
                        if (ok) clearSource("listado");
                      }}
                    >
                      Limpiar
                    </button>
                    <button style={S.btnPrimary} onClick={() => importarFuente("listado")}>Importar</button>
                  </div>
                </div>

                <div style={S.badges}>
                  <span style={S.badge}>Archivo: <b>{listado.file ? listado.file.name : "—"}</b></span>
                  <span style={S.badge}>Cargados en panel: <b>{listado.valid}</b></span>
                  <span style={S.badge}>Fuente en base: <b>{stats.listado}</b></span>
                </div>
              </div>
            </div>

            <div style={S.footer}>Ruta: <b>/admin</b></div>
          </>
        )}
      </div>
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
    maxWidth: 1240,
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
  inputSmall: { borderRadius: 12, border: "1px solid #cfd8e3", padding: "10px 12px", fontSize: 14, minWidth: 180 },
  select: { borderRadius: 12, border: "1px solid #cfd8e3", padding: "10px 12px", fontSize: 14, fontWeight: 700 },
  btnPrimary: { border: "none", background: "#0b4aa8", color: "#fff", padding: "12px 16px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  btnOutline: { border: "2px solid #0b4aa8", background: "#fff", color: "#0b4aa8", padding: "10px 14px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  btnGhost: { border: "1px solid #cfd8e3", background: "#f7f9fc", padding: "10px 14px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  btnDanger: { border: "2px solid #b91c1c", background: "#fff", color: "#b91c1c", padding: "10px 14px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },

  ok: { marginTop: 12, padding: 12, background: "#e9fff0", border: "1px solid #b9ffd0", borderRadius: 14, fontWeight: 900 },
  err: { marginTop: 12, padding: 12, background: "#ffe9e9", border: "1px solid #ffb9b9", borderRadius: 14, fontWeight: 900 },

  modeRow: { marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  progress: { marginTop: 12, padding: 10, background: "#fff8e6", border: "1px solid #ffe0a3", borderRadius: 14, fontWeight: 900 },

  statsGrid: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  statCard: {
    background: "#f8fbff",
    border: "1px solid #d7e6ff",
    borderRadius: 18,
    padding: 14,
  },
  statTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#0b4aa8",
  },
  statValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: 900,
    color: "#111827",
  },
  statSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },

  partidosPanel: {
    marginTop: 18,
    border: "1px solid #e6eefc",
    background: "#f8fbff",
    borderRadius: 18,
    padding: 14,
  },
  partidoFormGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 10,
  },
  partidoLegend: {
    marginTop: 10,
    display: "grid",
    gap: 4,
    color: "#555",
    fontSize: 13,
  },
  partidosList: {
    marginTop: 12,
    display: "grid",
    gap: 10,
  },
  partidoItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    background: "#fff",
    border: "1px solid #d7e6ff",
    flexWrap: "wrap",
  },

  logsPanel: {
    marginTop: 18,
    border: "1px solid #e6eefc",
    background: "#f8fbff",
    borderRadius: 18,
    padding: 14,
  },
  logsTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  logsFilters: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  logsBox: {
    marginTop: 12,
    maxHeight: 420,
    overflowY: "auto",
    display: "grid",
    gap: 10,
  },
  logItem: {
    borderRadius: 14,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  logMain: {
    display: "grid",
    gap: 4,
    minWidth: 320,
  },
  logSide: {
    display: "grid",
    gap: 4,
    textAlign: "right",
    marginLeft: "auto",
  },

  grid: { marginTop: 16, display: "grid", gridTemplateColumns: "1fr", gap: 14 },
  sourceCard: { border: "1px solid #e6eefc", background: "#f8fbff", borderRadius: 18, padding: 14 },
  sourceHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  sourceTitle: { display: "flex", gap: 12, alignItems: "center" },
  icon: { fontSize: 26 },
  sourceName: { fontSize: 18, fontWeight: 900 },
  sourceHint: { fontSize: 13, color: "#555" },
  sourceActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  badges: { marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" },
  badge: { background: "#fff", border: "1px solid #d7e6ff", padding: "6px 10px", borderRadius: 999, fontSize: 13 },

  footer: { marginTop: 12, fontSize: 13, color: "#333" },
};
