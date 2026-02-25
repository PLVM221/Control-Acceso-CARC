import { useEffect, useMemo, useRef, useState } from "react";

function parseCSV(text) {
  // Parser simple que soporta comillas. Si tu CSV es complejo, después lo mejoramos.
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^\uFEFF/, ""));
  const rows = lines.slice(1).map(splitLine);

  return { headers, rows };
}

function toPersons(headers, rows) {
  const idx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const iDni = idx("dni");
  const iNombre = idx("nombre");
  const iTipo = idx("tipoIngreso");
  const iPuerta = idx("puertaAcceso");
  const iUbic = idx("ubicacion");
  const iCuota = idx("cuota");

  const persons = [];
  for (const r of rows) {
    const dni = (r[iDni] ?? "").toString().trim();
    if (!dni) continue;

    persons.push({
      dni,
      nombre: (r[iNombre] ?? "").toString().trim(),
      tipoIngreso: (r[iTipo] ?? "").toString().trim(),
      puertaAcceso: (r[iPuerta] ?? "").toString().trim(),
      ubicacion: (r[iUbic] ?? "").toString().trim(),
      cuota: (r[iCuota] ?? "1").toString().trim() === "0" ? 0 : 1,
    });
  }
  return persons;
}

export default function AdminPage() {
  const fileRef = useRef(null);

  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);

  const [mode, setMode] = useState("NUEVO"); // NUEVO | AGREGAR
  const [csvInfo, setCsvInfo] = useState(null);
  const [persons, setPersons] = useState([]);

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // ✅ Enter para login
  const onLoginKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (password.trim().length > 0) setLogged(true);
    }
  };

  const seleccionarCSV = async (file) => {
    setErrorMsg("");
    setStatusMsg("");
    setCsvInfo(null);
    setPersons([]);

    if (!file) return;

    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    // Mostrar headers y conteos
    const parsed = toPersons(headers, rows);

    setCsvInfo({
      name: file.name,
      totalRows: rows.length,
      valid: parsed.length,
      headers,
    });
    setPersons(parsed);
  };

  const limpiarCSV = () => {
    setCsvInfo(null);
    setPersons([]);
    setErrorMsg("");
    setStatusMsg("");
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  async function callJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail ? `${data.error || "Error"}: ${data.detail}` : (data.error || "Error");
      throw new Error(msg);
    }
    return data;
  }

  const guardarListado = async () => {
    setErrorMsg("");
    setStatusMsg("");

    if (!logged) {
      setErrorMsg("Primero ingresá al admin.");
      return;
    }
    if (!password || password.trim().length === 0) {
      setErrorMsg("Falta la clave.");
      return;
    }
    if (!Array.isArray(persons) || persons.length === 0) {
      setErrorMsg("No hay datos para guardar (CSV vacío o inválido).");
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: persons.length });

    try {
      // 1) Si es NUEVO, reset primero
      if (mode === "NUEVO") {
        setStatusMsg("Borrando base (modo NUEVO)...");
        await callJSON("/api/admin/reset", { password });
      }

      // 2) Subir en lotes
      const BATCH = 500; // ✅ seguro para Vercel
      let done = 0;

      setStatusMsg(`Subiendo en lotes de ${BATCH}...`);

      for (let i = 0; i < persons.length; i += BATCH) {
        const chunk = persons.slice(i, i + BATCH);

        await callJSON("/api/admin/guardar", {
          password,
          mode,
          persons: chunk,
        });

        done += chunk.length;
        setProgress({ done, total: persons.length });
        setStatusMsg(`Cargados ${done}/${persons.length}...`);
      }

      setStatusMsg(`✅ Listo. Cargados ${persons.length} registros.`);
    } catch (e) {
      setErrorMsg(e.message || "Error de conexión con el servidor");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b53b6", padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", background: "#fff", borderRadius: 18, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900 }}>Admin — Control Acceso CARC</h1>
          <button
            onClick={() => { setLogged(false); setPassword(""); }}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#f8fafc", fontWeight: 700 }}
          >
            Salir
          </button>
        </div>

        {/* LOGIN */}
        {!logged && (
          <div style={{ marginTop: 18, padding: 14, borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Clave de Admin</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onLoginKeyDown}
                placeholder="Ingresá clave y presioná Enter"
                style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 16 }}
              />
              <button
                onClick={() => password.trim().length > 0 && setLogged(true)}
                style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#0b53b6", color: "#fff", fontWeight: 900 }}
              >
                Entrar
              </button>
            </div>
          </div>
        )}

        {/* CONTROLES */}
        <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Modo de carga:</div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1", fontWeight: 800 }}
            disabled={uploading}
          >
            <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
            <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
          </select>

          <button
            onClick={guardarListado}
            disabled={!logged || uploading}
            style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: "#0b53b6", color: "#fff", fontWeight: 900 }}
          >
            {uploading ? "Cargando..." : "Guardar listado"}
          </button>

          <label style={{ padding: "10px 14px", borderRadius: 12, border: "2px solid #0b53b6", fontWeight: 900, color: "#0b53b6", cursor: "pointer" }}>
            Seleccionar CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => seleccionarCSV(e.target.files?.[0])}
              disabled={uploading}
            />
          </label>

          <button
            onClick={limpiarCSV}
            disabled={uploading}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#f8fafc", fontWeight: 900 }}
          >
            Limpiar CSV
          </button>
        </div>

        {/* INFO CSV */}
        {csvInfo && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#f1f5ff", border: "1px solid #dbeafe" }}>
            <div style={{ fontWeight: 900 }}>
              CSV cargado: {csvInfo.name} — Filas: {csvInfo.totalRows} — Válidas (con DNI): {csvInfo.valid}
            </div>
            <div style={{ marginTop: 6, fontSize: 14 }}>
              Encabezados detectados:{" "}
              {csvInfo.headers.map((h) => (
                <span key={h} style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, border: "1px solid #cbd5e1", marginRight: 6, background: "#fff", fontWeight: 800 }}>
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* PROGRESO */}
        {uploading && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>{statusMsg}</div>
            <div style={{ height: 12, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  background: "#22c55e",
                }}
              />
            </div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>
              {progress.done}/{progress.total}
            </div>
          </div>
        )}

        {/* MENSAJES */}
        {errorMsg && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fee2e2", border: "1px solid #fecaca", fontWeight: 900 }}>
            ❌ {errorMsg}
          </div>
        )}
        {!uploading && statusMsg && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#dcfce7", border: "1px solid #bbf7d0", fontWeight: 900 }}>
            ✅ {statusMsg}
          </div>
        )}

        {/* AYUDA */}
        <div style={{ marginTop: 18, fontSize: 14 }}>
          <div style={{ fontWeight: 900 }}>Formato CSV (encabezados):</div>
          <div style={{ fontFamily: "monospace", background: "#f8fafc", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
          </div>
          <div style={{ marginTop: 6 }}>cuota: <b>1</b> = al día, <b>0</b> = debe cuota.</div>
          <div style={{ marginTop: 6 }}>Ruta: <b>/admin</b></div>
        </div>
      </div>
    </div>
  );
}
