import { useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null); // {status: 'ok'|'debe'|'noexiste'|'error', persona?, message?}
  const [historial, setHistorial] = useState([]);
  const inputRef = useRef(null);

  // Cargar historial desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("carc_historial");
      if (raw) setHistorial(JSON.parse(raw));
    } catch (e) {
      // si algo raro en storage, lo ignoramos
      setHistorial([]);
    }
  }, []);

  // Guardar historial cuando cambia
  useEffect(() => {
    try {
      localStorage.setItem("carc_historial", JSON.stringify(historial));
    } catch (e) {}
  }, [historial]);

  const canAutoSearch = useMemo(() => {
    const onlyDigits = dni.replace(/\D/g, "");
    return onlyDigits.length === 7 || onlyDigits.length === 8;
  }, [dni]);

  // Auto-búsqueda al llegar a 7–8 dígitos
  useEffect(() => {
    if (canAutoSearch) {
      buscar(dni.replace(/\D/g, ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoSearch]);

  const pushHistorial = (item) => {
    // item: {ts, dni, status, nombre?, tipoIngreso?, puertaAcceso?}
    setHistorial((prev) => {
      const next = [item, ...prev].slice(0, 20); // últimos 20
      return next;
    });
  };

  const limpiar = () => {
    setDni("");
    setResultado(null);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const buscar = async (dniParam) => {
    const clean = String(dniParam || "").replace(/\D/g, "");
    if (!clean) return;

    setLoading(true);
    setResultado(null);

    try {
      const res = await fetch(`/api/buscar?dni=${encodeURIComponent(clean)}`, {
        method: "GET",
      });

      if (!res.ok) {
        setResultado({ status: "error", message: "Error de conexión con el servidor." });
        pushHistorial({
          ts: Date.now(),
          dni: clean,
          status: "error",
        });
        return;
      }

      const data = await res.json();

      if (!data?.found) {
        setResultado({ status: "noexiste", message: "Persona no encontrada" });
        pushHistorial({
          ts: Date.now(),
          dni: clean,
          status: "noexiste",
        });
        return;
      }

      const p = data.persona || {};
      const cuotaNum = Number(p.cuota); // 1 o 0

      const status = cuotaNum === 0 ? "debe" : "ok";

      setResultado({
        status,
        persona: {
          dni: p.dni ?? clean,
          nombre: p.nombre ?? "",
          tipoIngreso: p.tipoIngreso ?? p.tipo_ingreso ?? p.sector ?? "",
          puertaAcceso: p.puertaAcceso ?? p.puerta_acceso ?? p.puerta ?? "",
          ubicacion: p.ubicacion ?? "",
          cuota: cuotaNum,
        },
      });

      pushHistorial({
        ts: Date.now(),
        dni: p.dni ?? clean,
        status,
        nombre: p.nombre ?? "",
        tipoIngreso: p.tipoIngreso ?? p.tipo_ingreso ?? p.sector ?? "",
        puertaAcceso: p.puertaAcceso ?? p.puerta_acceso ?? p.puerta ?? "",
      });
    } catch (e) {
      setResultado({ status: "error", message: "Error de conexión." });
      pushHistorial({
        ts: Date.now(),
        dni: clean,
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    width: "min(92vw, 520px)",
    background: "#ffffff",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
  };

  const pageStyle = {
    minHeight: "100vh",
    background: "#0A4AA6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  };

  const titleStyle = {
    margin: "8px 0 8px",
    textAlign: "center",
    fontSize: 34,
    color: "#0A4AA6",
    fontWeight: 800,
    letterSpacing: 0.2,
  };

  const subtitleStyle = {
    margin: "0 0 16px",
    textAlign: "center",
    color: "#333",
    fontSize: 15,
  };

  const inputRow = {
    display: "grid",
    gridTemplateColumns: "1fr 120px",
    gap: 12,
    alignItems: "center",
    marginTop: 6,
  };

  const inputStyle = {
    width: "100%",
    height: 56,
    borderRadius: 12,
    border: "1px solid #cfd8e3",
    padding: "0 16px",
    fontSize: 24,
    fontWeight: 700,
    outline: "none",
  };

  const btnStyle = (bg, color = "#111") => ({
    height: 56,
    borderRadius: 12,
    border: "none",
    background: bg,
    color,
    fontSize: 18,
    fontWeight: 800,
    cursor: "pointer",
  });

  const badgeBase = {
    marginTop: 14,
    borderRadius: 12,
    padding: "12px 12px",
    fontSize: 14,
    border: "1px solid #eee",
  };

  const footerBtn = {
    marginTop: 16,
    background: "#FFD200",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 900,
    textAlign: "center",
    color: "#000",
  };

  const formatTS = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src="/logo.png"
            alt="CARC"
            style={{ width: 74, height: 74, objectFit: "contain" }}
          />
        </div>

        <h1 style={titleStyle}>Control Acceso CARC</h1>
        <p style={subtitleStyle}>Ingrese DNI para validar acceso</p>

        <div style={inputRow}>
          <input
            ref={inputRef}
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="DNI (solo números)"
            style={inputStyle}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
          />

          <button
            onClick={() => buscar(dni)}
            style={btnStyle("#FFD200")}
            disabled={loading}
            title="Buscar"
          >
            {loading ? "..." : "Buscar"}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button onClick={limpiar} style={btnStyle("#f1f1f1")}>
            Limpiar
          </button>
        </div>

        {/* TIP */}
        <div style={{ ...badgeBase, background: "#fafafa", color: "#333" }}>
          <b>Tip:</b> al llegar a 7–8 dígitos, busca solo.
        </div>

        {/* RESULTADO */}
        {resultado && (
          <div
            style={{
              ...badgeBase,
              marginTop: 12,
              background:
                resultado.status === "ok"
                  ? "#eaffea"
                  : resultado.status === "debe"
                  ? "#fff4b8" // amarillo
                  : resultado.status === "noexiste"
                  ? "#ffe1c7" // naranja
                  : "#ffd7d7",
              border:
                resultado.status === "ok"
                  ? "1px solid #bde5bd"
                  : resultado.status === "debe"
                  ? "1px solid #e6d26a"
                  : resultado.status === "noexiste"
                  ? "1px solid #f0a76b"
                  : "1px solid #f2a1a1",
            }}
          >
            {resultado.status === "error" && (
              <div style={{ fontWeight: 900 }}>⚠ {resultado.message}</div>
            )}

            {resultado.status === "noexiste" && (
              <div style={{ fontWeight: 900, color: "#b34b00" }}>
                ❌ Persona no encontrada
              </div>
            )}

            {(resultado.status === "ok" || resultado.status === "debe") && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#0A4AA6" }}>
                    ✅ Validación
                  </div>

                  {resultado.status === "debe" && (
                    <div
                      style={{
                        marginLeft: "auto",
                        background: "#FFD200",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 900,
                      }}
                    >
                      Debe Cuota
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 10, lineHeight: 1.55 }}>
                  <div>
                    <b>DNI:</b> {resultado.persona.dni}
                  </div>
                  <div>
                    <b>Nombre:</b> {resultado.persona.nombre}
                  </div>
                  <div>
                    <b>Tipo de ingreso:</b> {resultado.persona.tipoIngreso}
                  </div>
                  <div>
                    <b>Puerta de acceso:</b> {resultado.persona.puertaAcceso}
                  </div>

                  {/* Ubicación solo si hay dato */}
                  {resultado.persona.ubicacion ? (
                    <div>
                      <b>Ubicación:</b> {resultado.persona.ubicacion}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 6 }}>
                    <b>Cuota:</b>{" "}
                    {Number(resultado.persona.cuota) === 1 ? "Al día" : "Debe cuota"}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* HISTORIAL */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 900, color: "#0A4AA6", marginBottom: 8 }}>
            Últimos accesos (local)
          </div>

          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 10,
              background: "#fff",
              maxHeight: 140,
              overflow: "auto",
            }}
          >
            {historial.length === 0 ? (
              <div style={{ color: "#666" }}>Todavía no hay registros.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {historial.map((h, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      background:
                        h.status === "ok"
                          ? "#eaffea"
                          : h.status === "debe"
                          ? "#fff4b8"
                          : h.status === "noexiste"
                          ? "#ffe1c7"
                          : "#ffd7d7",
                      border: "1px solid #eee",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <b>{h.dni}</b>
                      {h.nombre ? <span>• {h.nombre}</span> : null}
                      {h.tipoIngreso ? <span>• {h.tipoIngreso}</span> : null}
                      {h.puertaAcceso ? <span>• Puerta: {h.puertaAcceso}</span> : null}
                      <span style={{ marginLeft: "auto", color: "#333" }}>
                        {formatTS(h.ts)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={footerBtn}>Rosario Central 💙💛</div>
      </div>
    </div>
  );
}
