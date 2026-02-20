// pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";

const LS_BASE = "carc_base_personas_v1";
const LS_ACCESS_LOG = "carc_access_logs_v1";

function fmtDateTime(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${mi}:${ss}`;
}

function safeJSONParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e?.message || "JSON inválido" };
  }
}

function normalizePersona(p) {
  const dni = String(p?.dni ?? "").trim();
  const nombre = String(p?.nombre ?? "").trim();
  const tipoIngreso = String(p?.tipoIngreso ?? p?.sector ?? "").trim();
  const puertaAcceso = String(p?.puertaAcceso ?? "").trim();
  const ubicacion = String(p?.ubicacion ?? "").trim();
  let cuotaRaw = p?.cuota;
  let cuota = 1;
  if (cuotaRaw === 0 || cuotaRaw === "0" || cuotaRaw === false || cuotaRaw === "false") cuota = 0;
  if (cuotaRaw === 1 || cuotaRaw === "1" || cuotaRaw === true || cuotaRaw === "true") cuota = 1;

  return {
    dni,
    nombre,
    tipoIngreso,
    puertaAcceso,
    ...(ubicacion ? { ubicacion } : {}),
    cuota,
  };
}

function isValidPersona(p) {
  if (!p?.dni) return false;
  if (!/^\d+$/.test(p.dni)) return false;
  if (!p?.nombre) return false;
  return true;
}

function loadBaseFromLocalStorage() {
  const raw = localStorage.getItem(LS_BASE);
  if (!raw) return null;
  const parsed = safeJSONParse(raw);
  if (!parsed.ok || !Array.isArray(parsed.value)) return null;
  return parsed.value.map(normalizePersona).filter(isValidPersona);
}

function saveAccessLog(entry) {
  const raw = localStorage.getItem(LS_ACCESS_LOG);
  const parsed = raw ? safeJSONParse(raw) : { ok: true, value: [] };
  const arr = parsed.ok && Array.isArray(parsed.value) ? parsed.value : [];
  arr.unshift(entry);
  // recortamos a 30 para que no crezca infinito
  const trimmed = arr.slice(0, 30);
  localStorage.setItem(LS_ACCESS_LOG, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

function loadAccessLog() {
  const raw = localStorage.getItem(LS_ACCESS_LOG);
  if (!raw) return [];
  const parsed = safeJSONParse(raw);
  if (!parsed.ok || !Array.isArray(parsed.value)) return [];
  return parsed.value;
}

export default function Home() {
  const [dni, setDni] = useState("");
  const [base, setBase] = useState([]);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [result, setResult] = useState(null); // persona o null
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);

  const didInit = useRef(false);

  // Cargar base: primero localStorage (cargada por /admin), si no, data/personas.json
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const fromLS = loadBaseFromLocalStorage();
    if (fromLS && fromLS.length) {
      setBase(fromLS);
    } else {
      // fallback a data/personas.json
      fetch("/data/personas.json")
        .then((r) => r.json())
        .then((arr) => {
          if (Array.isArray(arr)) {
            setBase(arr.map(normalizePersona).filter(isValidPersona));
          } else {
            setBase([]);
          }
        })
        .catch(() => setBase([]));
    }

    setRecent(loadAccessLog());
  }, []);

  // Map por DNI para búsqueda rápida
  const baseMap = useMemo(() => {
    const m = new Map();
    for (const p of base) m.set(String(p.dni), p);
    return m;
  }, [base]);

  function pushLocalRecent(searchedDni, found) {
    const entry = {
      dni: String(searchedDni),
      at: new Date().toISOString(),
      found: !!found,
    };
    const updated = saveAccessLog(entry);
    setRecent(updated);
  }

  function clean() {
    setDni("");
    setResult(null);
    setStatus({ type: "", text: "" });
  }

  function validateDni(value) {
    if (!value) return { ok: false, msg: "Ingresá un DNI." };
    if (!/^\d+$/.test(value)) return { ok: false, msg: "Solo números." };
    return { ok: true };
  }

  async function doSearch(value) {
    const v = String(value ?? "").trim();
    const val = validateDni(v);
    if (!val.ok) {
      setStatus({ type: "warn", text: val.msg });
      setResult(null);
      return;
    }

    setLoading(true);
    setStatus({ type: "", text: "" });

    // buscar en base local
    const persona = baseMap.get(v) || null;

    if (!persona) {
      setResult(null);
      setStatus({ type: "notfound", text: "DNI no existe." });
      pushLocalRecent(v, false);
      setLoading(false);
      return;
    }

    setResult(persona);
    setStatus({ type: "ok", text: "Acceso encontrado." });
    pushLocalRecent(v, true);
    setLoading(false);
  }

  // Auto-buscar SOLO cuando llega a 8 dígitos
  useEffect(() => {
    if (!dni) return;
    if (dni.length === 8) {
      doSearch(dni);
    }
    // si es menos de 8: NO autobusca
  }, [dni]); // eslint-disable-line react-hooks/exhaustive-deps

  // estilos
  const bg = {
    minHeight: "100vh",
    padding: 24,
    background: "linear-gradient(180deg, #0b4db3 0%, #083a86 100%)",
    fontFamily: "Lexend, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const card = {
    width: "min(760px, 96vw)",
    background: "#fff",
    borderRadius: 22,
    padding: 26,
    boxShadow: "0 16px 46px rgba(0,0,0,0.25)",
  };

  const title = {
    margin: 0,
    fontSize: 38,
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: "#0b3ea8",
    textAlign: "center",
  };

  const subtitle = {
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
    color: "#111",
    opacity: 0.9,
    fontWeight: 700,
  };

  const logoWrap = { display: "flex", justifyContent: "center", marginBottom: 10 };
  const logo = { width: 72, height: 72, objectFit: "contain" };

  // ✅ “Achicar un poco” el input para que el botón quede más adentro
  // en vez de 1fr gigante, lo acotamos a un max-width
  const formRow = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 420px) 130px",
    justifyContent: "center",
    gap: 12,
    alignItems: "center",
  };

  const input = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid #c9d6ea",
    fontSize: 24,
    fontWeight: 900,
    outline: "none",
  };

  const btn = (variant) => ({
    padding: "14px 16px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 18,
    ...(variant === "primary"
      ? { background: "#ffd100", color: "#111" }
      : { background: "#eef2f7", color: "#111" }),
    opacity: loading ? 0.7 : 1,
  });

  const centerRow = { display: "flex", justifyContent: "center", marginTop: 10 };

  const tip = {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#f7f7f8",
    fontWeight: 700,
    color: "#1f2a37",
  };

  const sectionTitle = {
    marginTop: 14,
    fontWeight: 900,
    color: "#0b3ea8",
  };

  const recentBox = {
    marginTop: 8,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 10,
    background: "#fff",
    maxHeight: 130,
    overflow: "auto",
  };

  const recentItem = {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#ffe7cf",
    marginBottom: 8,
    fontWeight: 800,
  };

  const badgeBox = (type) => {
    if (type === "ok") return { background: "#e8fff1", color: "#0b4a22", border: "1px solid rgba(0,0,0,0.06)" };
    if (type === "warn") return { background: "#fff4cc", color: "#6a4b00", border: "1px solid rgba(0,0,0,0.06)" };
    if (type === "notfound")
      return { background: "#ffe0b7", color: "#6a2a00", border: "1px solid rgba(0,0,0,0.06)" }; // naranja
    return { background: "#f4f6f8", color: "#111", border: "1px solid rgba(0,0,0,0.06)" };
  };

  const resultCard = (variant) => ({
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    ...(variant === "debe"
      ? { background: "#fff4cc" } // amarillo Debe cuota
      : { background: "#e8fff1" }), // verde ok
  });

  const line = { display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontWeight: 800 };
  const k = { color: "#0b3ea8" };
  const v = { color: "#111", textAlign: "right" };

  const footer = {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    background: "#ffd100",
    fontWeight: 900,
    textAlign: "center",
  };

  return (
    <div style={bg}>
      <div style={card}>
        <div style={logoWrap}>
          <img src="/logo.png" alt="CARC" style={logo} />
        </div>

        <h1 style={title}>Control Acceso CARC</h1>
        <div style={subtitle}>Ingrese DNI para validar acceso</div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSearch(dni);
          }}
        >
          <div style={formRow}>
            <input
              value={dni}
              onChange={(e) => {
                // Solo números
                const only = e.target.value.replace(/\D/g, "");
                setDni(only);
              }}
              placeholder="DNI (solo números)"
              style={input}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
            />
            <button
              type="submit"
              style={btn("primary")}
              // ✅ si hay menos de 1 dígito no tiene sentido
              disabled={loading || dni.length < 1}
              title={dni.length < 1 ? "Ingresá un DNI" : "Buscar"}
            >
              {loading ? "..." : "Buscar"}
            </button>
          </div>

          <div style={centerRow}>
            <button type="button" onClick={clean} style={btn()} disabled={loading}>
              Limpiar
            </button>
          </div>
        </form>

        {/* TIP */}
        <div style={tip}>Tip: al llegar a 8 dígitos, busca solo.</div>

        {/* Status */}
        {status.text ? (
          <div style={{ ...badgeBox(status.type), marginTop: 10, padding: 12, borderRadius: 12, fontWeight: 900 }}>
            {status.type === "notfound" ? "⚠️ " : status.type === "warn" ? "⚠️ " : "✅ "}
            {status.text}
          </div>
        ) : null}

        {/* Resultado */}
        {result ? (
          <div style={resultCard(result.cuota === 0 ? "debe" : "ok")}>
            <div style={line}>
              <div style={k}>DNI</div>
              <div style={v}>{result.dni}</div>
            </div>
            <div style={line}>
              <div style={k}>Nombre</div>
              <div style={v}>{result.nombre}</div>
            </div>
            <div style={line}>
              <div style={k}>Tipo de ingreso</div>
              <div style={v}>{result.tipoIngreso || "-"}</div>
            </div>
            <div style={line}>
              <div style={k}>Puerta de acceso</div>
              <div style={v}>{result.puertaAcceso || "-"}</div>
            </div>

            {/* Ubicación solo si existe */}
            {result.ubicacion ? (
              <div style={line}>
                <div style={k}>Ubicación</div>
                <div style={v}>{result.ubicacion}</div>
              </div>
            ) : null}

            {/* Cuota (solo informativo con colores) */}
            <div style={line}>
              <div style={k}>Cuota</div>
              <div style={v}>
                {result.cuota === 1 ? (
                  <span style={{ color: "#0b4a22", fontWeight: 1000 }}>Cuota al día</span>
                ) : (
                  <span style={{ color: "#6a4b00", fontWeight: 1000 }}>Debe cuota</span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Últimos accesos */}
        <div style={sectionTitle}>Últimos accesos (local)</div>
        <div style={recentBox}>
          {recent.length === 0 ? (
            <div style={{ opacity: 0.8, padding: 8 }}>Todavía no hay registros.</div>
          ) : (
            recent.map((r, idx) => (
              <div
                key={idx}
                style={{
                  ...recentItem,
                  background: r.found ? "#ffe7cf" : "#ffe0b7", // naranja si no encontró
                }}
              >
                <div>{r.dni}</div>
                <div style={{ opacity: 0.85 }}>{fmtDateTime(r.at)}</div>
              </div>
            ))
          )}
        </div>

        <div style={footer}>Rosario Central 💙💛</div>
      </div>
    </div>
  );
}
