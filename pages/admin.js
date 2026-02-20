import { useEffect, useMemo, useState } from "react";

function parseCSVSmart(text) {
  // Normaliza saltos
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return [];

  // Detecta separador (coma o punto y coma)
  const firstLine = raw.split("\n")[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const sep = semiCount > commaCount ? ";" : ",";

  // Split de líneas (ignorando vacías)
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Parser simple con soporte básico de comillas
  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // Doble comilla escapada ""
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = "";
        continue;
      }

      cur += ch;
    }

    out.push(cur.trim());
    return out.map((v) => v.replace(/^"|"$/g, "").trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.trim());

  // Mapa flexible por si vienen headers distintos
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "");

  const idx = (nameVariants) => {
    const variants = nameVariants.map(norm);
    return headers.findIndex((h) => variants.includes(norm(h)));
  };

  const iDni = idx(["dni", "documento", "doc"]);
  const iNombre = idx(["nombre", "apellidoYnombre", "apellidoynombre", "persona"]);
  const iTipo = idx(["tipoingreso", "tipo", "ingreso"]);
  const iPuerta = idx(["puertaacceso", "puerta", "acceso"]);
  const iUbic = idx(["ubicacion", "ubicación", "ubic"]);
  const iCuota = idx(["cuota", "cuotaaldia", "cuota_al_dia"]);

  if (iDni === -1 || iNombre === -1) {
    throw new Error(
      'El CSV debe tener al menos las columnas "dni" y "nombre" en la primera fila.'
    );
  }

  const rows = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = splitLine(lines[r]);
    if (!cols.length) continue;

    const dni = (cols[iDni] || "").replace(/\D/g, ""); // solo números
    const nombre = (cols[iNombre] || "").trim();

    if (!dni || !nombre) continue;

    const tipoIngreso = iTipo >= 0 ? (cols[iTipo] || "").trim() : "";
    const puertaAcceso = iPuerta >= 0 ? (cols[iPuerta] || "").trim() : "";
    const ubicacion = iUbic >= 0 ? (cols[iUbic] || "").trim() : "";
    const cuotaRaw = iCuota >= 0 ? (cols[iCuota] || "").trim() : "";

    // cuota: 1/0. Si viene vacío -> lo dejamos vacío para no inventar.
    let cuota;
    if (cuotaRaw === "") cuota = "";
    else if (cuotaRaw === "1" || cuotaRaw.toLowerCase() === "si" || cuotaRaw.toLowerCase() === "sí") cuota = 1;
    else if (cuotaRaw === "0" || cuotaRaw.toLowerCase() === "no") cuota = 0;
    else {
      // si mandan cualquier cosa, intentamos convertir a número
      const n = Number(cuotaRaw);
      cuota = Number.isFinite(n) ? (n ? 1 : 0) : "";
    }

    const obj = {
      dni,
      nombre,
      tipoIngreso,
      puertaAcceso,
      ubicacion,
      cuota,
    };

    // Si ubicacion está vacía, la borramos para que no “aparezca ese dato”
    if (!obj.ubicacion) delete obj.ubicacion;
    // Si cuota está vacía, la borramos (opcional)
    if (obj.cuota === "") delete obj.cuota;
    // Si tipoIngreso/puertaAcceso vacíos, los borramos también (opcional)
    if (!obj.tipoIngreso) delete obj.tipoIngreso;
    if (!obj.puertaAcceso) delete obj.puertaAcceso;

    rows.push(obj);
  }

  return rows;
}

export default function Admin() {
  const [modo, setModo] = useState("AGREGAR"); // o "NUEVO"
  const [jsonText, setJsonText] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [logged, setLogged] = useState(true); // si ya tenés login hecho, lo dejamos así

  const placeholder = useMemo(() => {
    return `[
  {
    "dni":"25328387",
    "nombre":"Martin Lagamma",
    "tipoIngreso":"Empleado",
    "puertaAcceso":"Puerta 1-2-3-4-5-10",
    "ubicacion":"Total",
    "cuota":1
  }
]`;
  }, []);

  useEffect(() => {
    // si querés, podés traer lo que ya haya en data desde un endpoint (opcional)
  }, []);

  const setOK = (text) => setMsg({ type: "ok", text });
  const setERR = (text) => setMsg({ type: "err", text });

  async function guardar() {
    try {
      setMsg({ type: "", text: "" });

      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setERR("El JSON debe ser un ARRAY de objetos.");
        return;
      }

      // Validación mínima
      for (const p of parsed) {
        if (!p?.dni || !p?.nombre) {
          setERR('Cada registro debe tener "dni" y "nombre".');
          return;
        }
      }

      // Llama a tu endpoint existente.
      // Si tu proyecto ya guarda, dejalo igual.
      const res = await fetch("/api/admin/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, personas: parsed }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setERR(data?.error || "No se pudo guardar.");
        return;
      }

      setOK(data?.message || "Listado guardado OK.");
    } catch (e) {
      setERR("JSON inválido o error guardando: " + (e?.message || e));
    }
  }

  async function onCSVChange(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      setMsg({ type: "", text: "" });

      const text = await file.text();
      const rows = parseCSVSmart(text);

      if (!rows.length) {
        setERR("El CSV no trajo filas válidas. Revisá headers y contenido.");
        return;
      }

      setJsonText(JSON.stringify(rows, null, 2));
      setOK(`CSV cargado: ${rows.length} registros. Ahora podés “Guardar listado”.`);
    } catch (e) {
      setERR(e?.message || "No pude leer/parsear el CSV.");
    } finally {
      // permite volver a cargar el mismo archivo si lo editás
      ev.target.value = "";
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#064aa8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          background: "#fff",
          borderRadius: 22,
          padding: 22,
          boxShadow: "0 16px 40px rgba(0,0,0,.25)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34 }}>Admin — Control Acceso CARC</h1>

        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Modo de carga:</div>

          <select
            value={modo}
            onChange={(e) => setModo(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #c9d6ea",
              fontWeight: 700,
            }}
          >
            <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
            <option value="NUEVO">NUEVO (borra todo y carga de cero)</option>
          </select>

          <button
            onClick={guardar}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#0b3ea8",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Guardar listado
          </button>

          <label
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #c9d6ea",
              background: "#f7fbff",
              fontWeight: 800,
              cursor: "pointer",
            }}
            title="Subir CSV y convertirlo a JSON"
          >
            Seleccionar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onCSVChange}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <div style={{ marginTop: 10, color: "#333" }}>
          Pegá JSON o subí un CSV. Headers recomendados:
          <b> dni,nombre,tipoIngreso,puertaAcceso,ubicacion,cuota</b>
        </div>

        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder={placeholder}
          style={{
            marginTop: 12,
            width: "100%",
            minHeight: 380,
            borderRadius: 14,
            border: "1px solid #c9d6ea",
            padding: 14,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 14,
          }}
        />

        {msg.text ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid",
              borderColor: msg.type === "ok" ? "#b7ebc6" : "#f5b7b7",
              background: msg.type === "ok" ? "#eafff1" : "#ffecec",
              fontWeight: 800,
            }}
          >
            {msg.text}
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: logged ? "#12b76a" : "#d92d20",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 900,
            }}
          >
            {logged ? "✓" : "!"}
          </div>
          <div style={{ fontWeight: 800 }}>{logged ? "Logueado" : "No logueado"}</div>
        </div>

        <div style={{ marginTop: 8, opacity: 0.7, fontWeight: 700 }}>Ruta: /admin</div>
      </div>
    </div>
  );
}
