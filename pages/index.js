import { useEffect, useRef, useState } from "react";

const LS_HISTORY = "carc_historial_local_v1";

function normalizeDni(v) {
  return String(v ?? "").replace(/\D/g, "").trim();
}

function nowString() {
  return new Date().toLocaleString("es-AR");
}

export default function HomePage() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
      if (Array.isArray(saved)) setHistorial(saved);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_HISTORY, JSON.stringify(historial));
  }, [historial]);

  function agregarHistorial(dniBuscado) {
    const entry = {
      dni: dniBuscado,
      fecha: nowString(),
    };

    setHistorial((prev) => [entry, ...prev].slice(0, 50));
  }

  async function buscarDocumento(valorManual) {
    const dniBuscado = normalizeDni(valorManual ?? dni);

    if (!dniBuscado) return;

    setLoading(true);
    setResultado(null);

    try {
      const res = await fetch(`/api/buscar?dni=${dniBuscado}`);
      const data = await res.json();

      agregarHistorial(dniBuscado);

      if (!data.found) {
        setResultado({
          estado: "no_existe",
          mensaje: "DNI no existe.",
        });
        return;
      }

      if (Number(data.persona?.cuota) === 1) {
        setResultado({
          estado: "ok",
          mensaje: "Acceso habilitado.",
          persona: data.persona,
        });
      } else {
        setResultado({
          estado: "deuda",
          mensaje: "Debe cuota.",
          persona: data.persona,
        });
      }
    } catch (err) {
      setResultado({
        estado: "error",
        mensaje: "Error de conexión con el servidor.",
      });
    } finally {
      setLoading(false);
    }
  }

  function onChangeDni(e) {
    const value = normalizeDni(e.target.value);
    setDni(value);

    if (value.length === 8) {
      buscarDocumento(value);
    }
  }

  function limpiarTodo() {
    setDni("");
    setResultado(null);
    inputRef.current?.focus();
  }

  const colorResultado =
    resultado?.estado === "ok"
      ? { bg: "#dcfce7", border: "#86efac", color: "#166534" }
      : resultado?.estado === "deuda"
      ? { bg: "#fef3c7", border: "#fcd34d", color: "#92400e" }
      : resultado?.estado === "no_existe"
      ? { bg: "#ffedd5", border: "#fdba74", color: "#9a3412" }
      : { bg: "#fee2e2", border: "#fca5a5", color: "#991b1b" };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img
          src="/logo.png"
          alt="CARC"
          style={{ width: 78, height: 78, objectFit: "contain", marginBottom: 8 }}
        />

        <h1 style={styles.title}>Control Acceso CARC</h1>
        <div style={styles.subtitle}>Ingrese DNI para validar acceso</div>

        <div style={styles.searchRow}>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="DNI (solo números)"
            value={dni}
            onChange={onChangeDni}
            onKeyDown={(e) => {
              if (e.key === "Enter") buscarDocumento();
            }}
            style={styles.input}
          />

          <button
            onClick={() => buscarDocumento()}
            disabled={loading}
            style={styles.searchButton}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={limpiarTodo} style={styles.clearButton}>
            Limpiar
          </button>
        </div>

        <div style={styles.tipBox}>
          <b>Tip:</b> al llegar a 8 dígitos, busca solo.
        </div>

        {resultado && (
          <div
            style={{
              ...styles.resultBox,
              background: colorResultado.bg,
              borderColor: colorResultado.border,
              color: colorResultado.color,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>{resultado.mensaje}</div>

            {resultado.persona && (
              <div style={{ marginTop: 10, color: "#111827" }}>
                <div style={styles.resultLine}>
                  <b>Nombre:</b> {resultado.persona.nombre || "—"}
                </div>
                <div style={styles.resultLine}>
                  <b>Tipo de ingreso:</b> {resultado.persona.tipoIngreso || "—"}
                </div>
                <div style={styles.resultLine}>
                  <b>Ubicación:</b> {resultado.persona.ubicacion || "—"}
                </div>
                <div style={styles.resultLine}>
                  <b>DNI:</b> {resultado.persona.dni || "—"}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={styles.historyTitle}>Últimos accesos (local)</div>

        <div style={styles.historyBox}>
          {historial.length === 0 ? (
            <div style={{ color: "#666" }}>Todavía no hay registros.</div>
          ) : (
            historial.map((h, i) => (
              <div key={`${h.dni}-${h.fecha}-${i}`} style={styles.historyItem}>
                <span style={{ fontWeight: 900 }}>{h.dni}</span>
                <span>{h.fecha}</span>
              </div>
            ))
          )}
        </div>

        <div style={styles.footerBand}>Rosario Central 💙💛</div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b4aa8",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: 22,
    fontFamily:
      'Lexend, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  card: {
    width: "min(760px, 95vw)",
    background: "#f3f4f6",
    borderRadius: 28,
    padding: 28,
    boxShadow: "0 18px 40px rgba(0,0,0,.2)",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: 42,
    fontWeight: 900,
    color: "#1546ad",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 700,
    color: "#333",
  },
  searchRow: {
    marginTop: 18,
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  input: {
    width: 420,
    maxWidth: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "1px solid #c9d5ea",
    fontSize: 24,
    fontWeight: 900,
    outline: "none",
    background: "#fff",
  },
  searchButton: {
    padding: "16px 28px",
    borderRadius: 16,
    border: "none",
    background: "#f5c400",
    color: "#111",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  clearButton: {
    padding: "14px 26px",
    borderRadius: 16,
    border: "none",
    background: "#e5e7eb",
    color: "#111",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  tipBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    textAlign: "left",
    fontSize: 16,
    fontWeight: 700,
    color: "#374151",
  },
  resultBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    border: "1px solid",
    textAlign: "left",
  },
  resultLine: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 1.4,
  },
  historyTitle: {
    marginTop: 18,
    textAlign: "left",
    fontSize: 18,
    fontWeight: 900,
    color: "#1546ad",
  },
  historyBox: {
    marginTop: 10,
    borderRadius: 16,
    border: "1px solid #d1d5db",
    background: "#f8fafc",
    padding: 12,
    maxHeight: 180,
    overflowY: "auto",
    textAlign: "left",
  },
  historyItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 12,
    background: "#f5d9a6",
    color: "#111",
    marginBottom: 8,
    fontSize: 16,
  },
  footerBand: {
    marginTop: 18,
    background: "#f5c400",
    color: "#111",
    borderRadius: 16,
    padding: "12px 18px",
    fontWeight: 900,
    fontSize: 18,
  },
};
