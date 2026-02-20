import { useEffect, useMemo, useRef, useState } from "react";

function parseCSV(text) {
  const firstLine = text.split("\n")[0];

  // Detectar separador automáticamente
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const rows = text
    .split(/\r?\n/)
    .filter((r) => r.trim() !== "")
    .map((line) => line.split(delimiter).map((c) => c.trim()));

  if (!rows.length) return { headers: [], data: [] };

  const headers = rows[0];
  const data = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    return obj;
  });

  return { headers, data };
}
  const pushRow = () => {
    // evitar filas vacías
    if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ",") {
        pushField();
        i++;
        continue;
      }
      if (ch === "\n") {
        pushField();
        pushRow();
        i++;
        continue;
      }
      if (ch === "\r") {
        // ignore CR
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }

  // último campo/fila
  pushField();
  pushRow();

  if (!rows.length) return { headers: [], data: [] };

  const headers = rows[0].map((h) => String(h || "").trim());
  const data = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });

  return { headers, data };
}

function normalizeFromCSV(obj) {
  // Acepta encabezados: dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
  // También tolera: tipo_ingreso, puerta_acceso
  const dni = String(obj.dni ?? "").trim();
  if (!dni) return null;

  const nombre = String(obj.nombre ?? "").trim();

  const tipoIngreso = String(obj.tipoIngreso ?? obj.tipo_ingreso ?? "").trim();
  const puertaAcceso = String(obj.puertaAcceso ?? obj.puerta_acceso ?? "").trim();
  const ubicacion = String(obj.ubicacion ?? "").trim();
  const cuotaRaw = String(obj.cuota ?? "").trim();

  let cuota = 1;
  if (cuotaRaw === "0") cuota = 0;
  if (cuotaRaw === "1") cuota = 1;

  return {
    dni,
    nombre,
    tipoIngreso,
    puertaAcceso,
    ubicacion,
    cuota,
  };
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);

  const [modo, setModo] = useState("AGREGAR"); // NUEVO | AGREGAR
  const [jsonText, setJsonText] = useState(
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

  const [csvInfo, setCsvInfo] = useState(null); // {headers, data, normalized}
  const [msg, setMsg] = useState({ type: "", text: "" });
  const fileRef = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_ok");
    if (saved === "1") setAuthed(true);
  }, []);

  const listadoFinal = useMemo(() => {
    if (csvInfo?.normalized?.length) return csvInfo.normalized;
    // fallback JSON
    try {
      const parsed = JSON.parse(jsonText);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [csvInfo, jsonText]);

  const doLogin = () => {
    if (!password.trim()) return;
    // validación real la hace el backend al guardar; acá solo habilitamos UI
    sessionStorage.setItem("admin_ok", "1");
    sessionStorage.setItem("admin_pass", password);
    setAuthed(true);
    setMsg({ type: "ok", text: "✅ Logueado" });
  };

  const onPickCSV = async (file) => {
    if (!file) return;
    const text = await file.text();
    const { headers, data } = parseCSV(text);

    // Normalizar filas
    const normalized = data.map(normalizeFromCSV).filter(Boolean);

    setCsvInfo({ fileName: file.name, headers, dataCount: data.length, normalized });

    // También volcamos a textarea para que veas lo que se va a guardar
    setJsonText(JSON.stringify(normalized, null, 2));
    setMsg({
      type: "ok",
      text: `✅ CSV leído: ${file.name} — Filas: ${data.length} — Válidas (con DNI): ${normalized.length}`,
    });
  };

  const guardar = async () => {
    setMsg({ type: "", text: "" });

    const pass = sessionStorage.getItem("admin_pass") || password;
    if (!pass) {
      setMsg({ type: "err", text: "❌ Falta contraseña de admin" });
      return;
    }

    // Validación mínima
    if (!listadoFinal.length) {
      setMsg({ type: "err", text: "❌ No hay datos para guardar (CSV vacío o JSON inválido)" });
      return;
    }

    const resp = await fetch("/api/admin/guardar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pass },
      body: JSON.stringify({
        password: pass,
        modo,
        listado: listadoFinal,
      }),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      setMsg({ type: "err", text: `❌ Error: ${data?.error || "No se pudo guardar"}` });
      return;
    }

    setMsg({
      type: "ok",
      text: `✅ Guardado OK. Modo: ${data.modo}. Recibidas: ${data.recibidas}. Guardadas: ${data.guardadas}.`,
    });
  };

  const boxStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0B4FB3,#0A3E8C)",
    padding: 24,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily: "Lexend, system-ui, -apple-system, Segoe UI, Roboto, Arial",
  };

  const cardStyle = {
    width: "min(980px, 95vw)",
    background: "#fff",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 18px 55px rgba(0,0,0,.25)",
  };

  if (!authed) {
    return (
      <div style={boxStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 34, color: "#0B4FB3" }}>Admin — Control Acceso CARC</h1>
          <p style={{ marginTop: 10, color: "#333" }}>
            Ingresá la contraseña para administrar la base.
          </p>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <input
              type="password"
              placeholder="Contraseña admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doLogin();
              }}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                fontSize: 16,
              }}
            />
            <button
              onClick={doLogin}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "#0B4FB3",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Entrar
            </button>
          </div>

          {msg.text ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                background: msg.type === "ok" ? "#DCFCE7" : "#FEE2E2",
                border: "1px solid " + (msg.type === "ok" ? "#86EFAC" : "#FCA5A5"),
              }}
            >
              {msg.text}
            </div>
          ) : null}

          <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
            Ruta: <b>/admin</b> — Tip: podés apretar <b>Enter</b> para ingresar.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: 34 }}>Admin — Control Acceso CARC</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <b>Modo de carga:</b>
            <select
              value={modo}
              onChange={(e) => setModo(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
            >
              <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
              <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
            </select>
          </div>

          <button
            onClick={guardar}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: "#0B4FB3",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Guardar listado
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => onPickCSV(e.target.files?.[0])}
          />

          <button
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #0B4FB3",
              background: "white",
              color: "#0B4FB3",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Seleccionar CSV
          </button>

          <button
            onClick={() => {
              setCsvInfo(null);
              setMsg({ type: "ok", text: "🧹 CSV limpiado (quedó el JSON manual)." });
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#111",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Limpiar CSV
          </button>
        </div>

        <div style={{ marginTop: 10, color: "#333" }}>
          {csvInfo ? (
            <div style={{ fontSize: 14 }}>
              <b>CSV cargado:</b> {csvInfo.fileName} — Filas: {csvInfo.dataCount} — Válidas (con DNI):{" "}
              {csvInfo.normalized.length}
              <div style={{ marginTop: 6, color: "#555" }}>
                Encabezados detectados:{" "}
                <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 8 }}>
                  {csvInfo.headers.join(", ")}
                </code>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: "#666" }}>
              Podés pegar un listado en formato <b>JSON</b> o seleccionar un <b>CSV</b>.
            </div>
          )}
        </div>

        {msg.text ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: msg.type === "ok" ? "#DCFCE7" : "#FEE2E2",
              border: "1px solid " + (msg.type === "ok" ? "#86EFAC" : "#FCA5A5"),
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.text}
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Listado (JSON) — si cargás CSV se completa solo:
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            style={{
              width: "100%",
              height: 420,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #cbd5e1",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          />
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
          <b>Formato CSV recomendado (encabezados):</b>{" "}
          <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 8 }}>
            dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
          </code>
          <br />
          <b>cuota</b>: 1 = al día, 0 = debe cuota.
          <br />
          Ruta: <b>/admin</b>
        </div>
      </div>
    </div>
  );
}
