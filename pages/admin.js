import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";

const LS_ADMIN_OK = "carc_admin_ok_v1";

function onlyDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
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

// CSV simple pero robustito (maneja comillas "...")
function parseCSV(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const delim = detectDelimiter(lines[0]);

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // doble comilla -> escape
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
        continue;
      }

      if (!inQ && ch === delim) {
        out.push(cur.trim());
        cur = "";
        continue;
      }

      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headersRaw = parseLine(lines[0]);
  const headers = headersRaw.map((h) => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    // Normaliza a largo de headers
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows, delimiter: delim };
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "");
}

function buildPersonsFromCSV(parsed) {
  const normHeaders = parsed.headers.map((h) => normalizeHeader(h));

  // headers esperados (case-insensitive + tolerante)
  const idx = (nameVariants) => {
    for (const v of nameVariants) {
      const n = normalizeHeader(v);
      const pos = normHeaders.indexOf(n);
      if (pos >= 0) return pos;
    }
    return -1;
  };

  const iDni = idx(["dni", "documento"]);
  const iNombre = idx(["nombre", "apellidoynombre", "apellidoNombre", "socio"]);
  const iTipo = idx(["tipoingreso", "tipo", "sect", "sector", "tipo_de_ingreso"]);
  const iPuerta = idx(["puertaacceso", "puerta", "acceso", "puertas"]);
  const iUbic = idx(["ubicacion", "ubicación", "lugar"]);
  const iCuota = idx(["cuota", "cuotaaldia", "estadoCuota", "debecuota"]);

  const required = [
    { key: "dni", pos: iDni },
    { key: "nombre", pos: iNombre },
    { key: "tipoIngreso", pos: iTipo },
    { key: "puertaAcceso", pos: iPuerta },
    { key: "ubicacion", pos: iUbic },
    { key: "cuota", pos: iCuota },
  ];

  const missing = required.filter((r) => r.pos < 0).map((r) => r.key);
  if (missing.length) {
    return {
      ok: false,
      error:
        "Faltan encabezados: " +
        missing.join(", ") +
        ". Recomendado: dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota",
      persons: [],
      validCount: 0,
    };
  }

  const persons = [];
  let validCount = 0;

  for (const row of parsed.rows) {
    const values = parsed.headers.map((h) => row[h] ?? "");
    const dni = onlyDigits(values[iDni]);
    if (!dni) continue;

    const cuotaRaw = String(values[iCuota] ?? "").trim();
    // cuota: 1 al día / 0 debe cuota. Si viene vacío -> 1 por defecto
    let cuota = 1;
    if (cuotaRaw !== "") {
      const n = Number(onlyDigits(cuotaRaw));
      cuota = n === 0 ? 0 : 1;
    }

    const obj = {
      dni,
      nombre: String(values[iNombre] ?? "").trim(),
      tipoIngreso: String(values[iTipo] ?? "").trim(),
      puertaAcceso: String(values[iPuerta] ?? "").trim(),
      ubicacion: String(values[iUbic] ?? "").trim(),
      cuota,
    };

    persons.push(obj);
    validCount++;
  }

  return { ok: true, persons, validCount };
}

function dedupeByDniKeepLast(arr) {
  // Si hay repetidos, pisa y queda el último
  const map = {};
  for (const item of arr) {
    const dni = onlyDigits(item?.dni);
    if (!dni) continue;
    map[dni] = { ...item, dni };
  }
  return Object.values(map);
}

export default function AdminPage() {
  const fileRef = useRef(null);

  const [adminOk, setAdminOk] = useState(false);
  const [password, setPassword] = useState("");

  const [mode, setMode] = useState("AGREGAR"); // NUEVO | AGREGAR
  const [jsonText, setJsonText] = useState(""); // <-- entra vacío (sin ejemplo)
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [csvInfo, setCsvInfo] = useState({
    name: "",
    rows: 0,
    valid: 0,
    headers: [],
    delimiter: "",
  });

  useEffect(() => {
    const ok = localStorage.getItem(LS_ADMIN_OK) === "1";
    setAdminOk(ok);
  }, []);

  function setOkMessage(msg) {
    setErrorMsg("");
    setStatusMsg(msg);
  }
  function setErrMessage(msg) {
    setStatusMsg("");
    setErrorMsg(msg);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrMessage(data?.error || "Contraseña incorrecta.");
        return;
      }
      localStorage.setItem(LS_ADMIN_OK, "1");
      setAdminOk(true);
      setPassword("");
      setOkMessage("Logueado ✅");
    } catch (e) {
      setErrMessage("Error de conexión al intentar loguear.");
    }
  }

  function logout() {
    localStorage.removeItem(LS_ADMIN_OK);
    setAdminOk(false);
    setPassword("");
    setOkMessage("");
    setErrMessage("");
  }

  function onPasswordKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      doLogin();
    }
  }

  function clickSelectCSV() {
    setStatusMsg("");
    setErrorMsg("");
    if (fileRef.current) fileRef.current.click();
  }

  async function onCSVSelected(e) {
    setStatusMsg("");
    setErrorMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCSV(text);

      const built = buildPersonsFromCSV(parsed);
      if (!built.ok) {
        setCsvInfo({
          name: file.name,
          rows: parsed.rows.length,
          valid: 0,
          headers: parsed.headers,
          delimiter: parsed.delimiter,
        });
        setErrMessage(built.error);
        return;
      }

      const deduped = dedupeByDniKeepLast(built.persons);

      setCsvInfo({
        name: file.name,
        rows: parsed.rows.length,
        valid: deduped.length,
        headers: parsed.headers,
        delimiter: parsed.delimiter,
      });

      setJsonText(JSON.stringify(deduped, null, 2));
      setOkMessage(
        `CSV cargado: ${file.name} — Filas: ${parsed.rows.length} — Válidas (con DNI): ${deduped.length}`
      );
    } catch (err) {
      setErrMessage("No se pudo leer/procesar el CSV.");
    }
  }

  function clearCSV() {
    setCsvInfo({ name: "", rows: 0, valid: 0, headers: [], delimiter: "" });
    setJsonText("");
    setStatusMsg("");
    setErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function guardarListado() {
    setStatusMsg("");
    setErrorMsg("");

    let arr;
    try {
      const parsed = JSON.parse(jsonText || "[]");
      if (!Array.isArray(parsed)) {
        setErrMessage("El JSON debe ser un array: [ { ... }, { ... } ]");
        return;
      }
      arr = parsed;
    } catch (e) {
      setErrMessage("JSON inválido (revisá comas, llaves y comillas).");
      return;
    }

    // ✅ DEDUPE ACÁ (exactamente antes de enviar al backend)
    const deduped = dedupeByDniKeepLast(arr);

    if (!deduped.length) {
      setErrMessage("No hay datos para guardar (CSV vacío o JSON inválido).");
      return;
    }

    // Normaliza campos mínimos
    const cleaned = deduped.map((p) => ({
      dni: onlyDigits(p.dni),
      nombre: String(p.nombre ?? "").trim(),
      tipoIngreso: String(p.tipoIngreso ?? "").trim(),
      puertaAcceso: String(p.puertaAcceso ?? "").trim(),
      ubicacion: String(p.ubicacion ?? "").trim(),
      cuota: Number(p.cuota) === 0 ? 0 : 1,
    }));

    try {
      const res = await fetch("/api/admin/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, // "NUEVO" o "AGREGAR"
          persons: cleaned,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setErrMessage(data?.error || "No se pudo guardar.");
        return;
      }

      setOkMessage(
        `Guardado OK ✅ — recibidos: ${cleaned.length} — insert/upsert: ${data?.count ?? "?"}`
      );
    } catch (e) {
      setErrMessage("Error de conexión guardando en el servidor.");
    }
  }

  const styles = useMemo(
    () => ({
      page: {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0047AB 0%, #003B8F 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        fontFamily:
          "Lexend, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },
      card: {
        width: "min(980px, 96vw)",
        background: "#fff",
        borderRadius: 24,
        padding: 28,
        boxShadow: "0 18px 50px rgba(0,0,0,.25)",
      },
      title: {
        fontSize: 34,
        margin: 0,
        marginBottom: 14,
        fontWeight: 800,
      },
      row: {
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
      },
      label: {
        fontWeight: 700,
      },
      select: {
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #cfd6e6",
        fontWeight: 600,
        background: "#fff",
      },
      btn: {
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid #cfd6e6",
        background: "#fff",
        fontWeight: 800,
        cursor: "pointer",
      },
      btnPrimary: {
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid #0b4dbb",
        background: "#0b4dbb",
        color: "#fff",
        fontWeight: 900,
        cursor: "pointer",
      },
      btnOutline: {
        padding: "10px 14px",
        borderRadius: 12,
        border: "2px solid #0b4dbb",
        background: "#fff",
        color: "#0b4dbb",
        fontWeight: 900,
        cursor: "pointer",
      },
      infoLine: {
        marginTop: 10,
        fontWeight: 600,
        color: "#1d2a44",
      },
      badge: {
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        background: "#f3f6ff",
        border: "1px solid #dfe7ff",
        fontWeight: 700,
        marginRight: 6,
        marginTop: 6,
      },
      textarea: {
        width: "100%",
        height: 360,
        marginTop: 10,
        borderRadius: 14,
        border: "1px solid #cfd6e6",
        padding: 14,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        outline: "none",
      },
      ok: {
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        background: "#e8fff0",
        border: "1px solid #7ee2a8",
        fontWeight: 800,
      },
      err: {
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        background: "#ffe9e9",
        border: "1px solid #ff9a9a",
        fontWeight: 900,
      },
      footer: {
        marginTop: 14,
        fontWeight: 700,
        color: "#1d2a44",
        opacity: 0.85,
      },
      loginBox: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: 8,
      },
      input: {
        padding: "12px 12px",
        borderRadius: 12,
        border: "1px solid #cfd6e6",
        minWidth: 260,
        fontWeight: 700,
        outline: "none",
      },
      logout: {
        marginLeft: "auto",
      },
    }),
    []
  );

  return (
    <>
      <Head>
        <title>Admin — Control Acceso CARC</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;500;700;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Admin — Control Acceso CARC</h1>

          {!adminOk ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Ingresá la contraseña para administrar
              </div>
              <div style={styles.loginBox}>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onPasswordKeyDown} // ✅ Enter loguea
                />
                <button style={styles.btnPrimary} onClick={doLogin}>
                  Entrar
                </button>
              </div>

              {errorMsg ? <div style={styles.err}>✖ {errorMsg}</div> : null}
              {statusMsg ? <div style={styles.ok}>{statusMsg}</div> : null}

              <div style={styles.footer}>Ruta: /admin</div>
            </>
          ) : (
            <>
              <div style={styles.row}>
                <span style={styles.label}>Modo de carga:</span>
                <select
                  style={styles.select}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
                  <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
                </select>

                <button style={styles.btnPrimary} onClick={guardarListado}>
                  Guardar listado
                </button>

                <button style={styles.btnOutline} onClick={clickSelectCSV}>
                  Seleccionar CSV
                </button>

                <button style={styles.btn} onClick={clearCSV}>
                  Limpiar CSV
                </button>

                <button style={{ ...styles.btn, ...styles.logout }} onClick={logout}>
                  Salir
                </button>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={onCSVSelected}
                />
              </div>

              <div style={styles.infoLine}>
                {csvInfo.name ? (
                  <>
                    <b>CSV cargado:</b> {csvInfo.name} — <b>Filas:</b> {csvInfo.rows}{" "}
                    — <b>Válidas (con DNI):</b> {csvInfo.valid}
                    <div style={{ marginTop: 6 }}>
                      <b>Encabezados detectados:</b>{" "}
                      {csvInfo.headers.map((h, i) => (
                        <span key={i} style={styles.badge}>
                          {h}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    Pegá acá tu listado en formato <b>JSON</b> (o cargá CSV).
                  </>
                )}
              </div>

              {errorMsg ? <div style={styles.err}>✖ {errorMsg}</div> : null}
              {statusMsg ? <div style={styles.ok}>{statusMsg}</div> : null}

              <div style={{ marginTop: 14, fontWeight: 900 }}>
                Listado (JSON) — si cargás CSV se completa solo:
              </div>

              <textarea
                style={styles.textarea}
                value={jsonText} // ✅ vacío por defecto
                onChange={(e) => setJsonText(e.target.value)}
                placeholder={`[
  {
    "dni":"25328387",
    "nombre":"Martin Lagamma",
    "tipoIngreso":"Empleado",
    "puertaAcceso":"Puerta 1-2-3-4-5-10",
    "ubicacion":"Total",
    "cuota":1
  }
]`}
              />

              <div style={styles.footer}>
                Formato CSV recomendado (encabezados):{" "}
                <span style={styles.badge}>
                  dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota
                </span>
                <br />
                cuota: <b>1</b> = al día, <b>0</b> = debe cuota. <br />
                Ruta: <b>/admin</b>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
