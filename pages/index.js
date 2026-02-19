import { useState } from "react";

export default function Home() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // {dni,nombre,sector}
  const [error, setError] = useState("");

  async function buscar() {
    const limpio = dni.replace(/\D/g, "");
    if (!limpio) {
      setError("Ingresá un DNI");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const r = await fetch(`/api/buscar?dni=${encodeURIComponent(limpio)}`);
      if (r.ok) {
        const data = await r.json();
        setResult(data);
      } else if (r.status === 404) {
        setError("Persona no encontrada");
      } else {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "Error de conexión / base no cargada");
      }
    } catch (e) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") buscar();
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img
          src="/logo.png"
          alt="CARC"
          style={styles.logo}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />

        <h1 style={styles.title}>Control Acceso CARC</h1>
        <p style={styles.sub}>Sistema online funcionando ✅</p>

        <div style={styles.row}>
          <input
            inputMode="numeric"
            placeholder="Ingresar DNI"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            onKeyDown={onKeyDown}
            style={styles.input}
          />
          <button onClick={buscar} style={styles.btn} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {result && (
          <div style={styles.okBox}>
            <div style={styles.okTitle}>✅ Habilitado</div>
            <div style={styles.okLine}>
              <b>Nombre:</b> {result.nombre}
            </div>
            <div style={styles.okLine}>
              <b>Sector:</b> {result.sector}
            </div>
            <div style={styles.okLine}>
              <b>DNI:</b> {result.dni}
            </div>
          </div>
        )}

        {error && <div style={styles.errBox}>⚠️ {error}</div>}

        <div style={styles.footer}>Rosario Central 💙💛</div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0053A6", // azul central
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "white",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
    textAlign: "center",
  },
  logo: { width: 72, height: 72, objectFit: "contain", margin: "0 auto 6px" },
  title: { margin: "8px 0 6px", color: "#0053A6", fontSize: 34 },
  sub: { margin: 0, color: "#333", opacity: 0.85 },
  row: {
    marginTop: 18,
    display: "flex",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  input: {
    flex: "1 1 220px",
    maxWidth: 320,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #cfd6dd",
    fontSize: 16,
    outline: "none",
  },
  btn: {
    flex: "0 0 auto",
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#FFD200", // amarillo central
    color: "#111",
    fontWeight: 700,
    cursor: "pointer",
  },
  okBox: {
    marginTop: 16,
    textAlign: "left",
    background: "#F3FFF5",
    border: "1px solid #B7F0C2",
    borderRadius: 12,
    padding: 14,
  },
  okTitle: { fontWeight: 800, marginBottom: 8 },
  okLine: { margin: "6px 0", color: "#1a1a1a" },
  errBox: {
    marginTop: 16,
    background: "#FFF3F3",
    border: "1px solid #FFB8B8",
    borderRadius: 12,
    padding: 12,
    color: "#7a0000",
    fontWeight: 700,
  },
  footer: {
    marginTop: 18,
    background: "#FFD200",
    borderRadius: 12,
    padding: 10,
    fontWeight: 800,
  },
};
