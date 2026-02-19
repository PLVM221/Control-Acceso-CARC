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

  async function subir(modo) {
    setMsg("");
    let personas;
    try { personas = JSON.parse(jsonText); }
    catch { return setMsg("❌ JSON inválido"); }

    const r = await fetch("/api/admin/personas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ modo, personas }),
    });
    const j = await r.json();
    if (!j.ok) return setMsg(j.error || "Error");
    setMsg(`✅ OK. Total en base: ${j.total ?? "?"}`);
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
            <button onClick={login} style={styles.btnYellow}>Entrar</button>
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
          <button onClick={() => setView("home")} style={styles.btnBlue}>🏠 Inicio</button>
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
              Formato esperado (JSON):<br />
              <code>
                [{"{dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota}"}]
              </code>
            </div>
          </>
        )}

        {(view === "nueva" || view === "agregar") && (
          <>
            <h2 style={{ marginTop: 18 }}>
              {view === "nueva" ? "🆕 Nueva base (REEMPLAZAR)" : "➕ Agregar/Actualizar (AGREGAR)"}
            </h2>

            <div style={styles.help}>
              Pegá tu listado en JSON. (Luego te agrego botón de CSV/Excel).
              <br />
              <b>cuota:</b> 1 al día / 0 debe.
            </div>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={styles.textarea}
              placeholder='[{"dni":"12345678","nombre":"Juan","tipoIngreso":"Socio","puertaAcceso":"Puerta 3","ubicacion":"Popular","cuota":1}]'
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {view === "nueva" ? (
                <button onClick={() => subir("REEMPLAZAR")} style={styles.btnRed}>
                  ⚠ Reemplazar todo
                </button>
              ) : (
                <button onClick={() => subir("AGREGAR")} style={styles.btnBlue}>
                  Guardar (agregar/actualizar)
                </button>
              )}
              <button onClick={() => setJsonText("[]")} style={styles.btnGray}>Vaciar</button>
            </div>
          </>
        )}

        {view === "logs" && (
          <>
            <h2 style={{ marginTop: 18 }}>📜 Logs por fechas</h2>

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
                  <div key={idx} style={{
                    ...styles.logRow,
                    background: l.encontrado ? "#E9FFF0" : "#FFE2B5"
                  }}>
                    <div><b>{new Date(l.ts).toLocaleString()}</b></div>
                    <div>DNI: <b>{l.dni_buscado}</b> — {l.encontrado ? "✅ Encontrado" : "⛔ No existe"}</div>
                    {l.encontrado ? (
                      <div style={{ opacity: 0.85 }}>
                        {l.nombre} • {l.tipo_ingreso} • {l.puerta_acceso} • Cuota: {String(l.cuota) === "1" ? "Al día" : "Debe"}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </>
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
    cursor: "pointer"
  },
  tileIcon: { fontSize: 34, width: 46, textAlign: "center" },
  tileTitle: { fontWeight: 900, fontSize: 16 },
  tileDesc: { opacity: 0.75, fontSize: 13 },

  help: { marginTop: 12, background: "#f7f7f7", padding: 12, borderRadius: 12, fontSize: 13 },
  textarea: { width: "100%", minHeight: 320, marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #ccc", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },

  logsBox: { marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 10, maxHeight: 520, overflow: "auto" },
  logRow: { padding: 10, borderRadius: 10, marginBottom: 8, border: "1px solid #eee" }
};
