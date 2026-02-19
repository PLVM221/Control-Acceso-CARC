import { useState } from "react";

export default function Home() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  async function buscar() {
    setError("");
    setResultado(null);

    const d = (dni || "").trim();
    if (!d) {
      setError("Ingresá un DNI.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`/api/buscar?dni=${encodeURIComponent(d)}`);
      const data = await r.json();

      if (!r.ok) {
        setError(data?.error || "Error de búsqueda");
      } else {
        setResultado(data);
      }
    } catch (e) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  const noExiste = !!error && error.toLowerCase().includes("no existe");
  const cuotaDebe = resultado && Number(resultado.cuota) === 0;
  const cuotaOk = resultado && Number(resultado.cuota) === 1;

  const estadoStyles = (() => {
    if (noExiste) return { background: "#ff8a00", color: "#111" }; // naranja
    if (cuotaDebe) return { background: "#ffd400", color: "#111" }; // amarillo
    if (cuotaOk) return { background: "#1db954", color: "#fff" }; // verde
    return { background: "#f2f2f2", color: "#111" };
  })();

  const estadoTexto = (() => {
    if (noExiste) return "NO EXISTE";
    if (cuotaDebe) return "DEBE CUOTA";
    if (cuotaOk) return "CUOTA AL DÍA";
    return "";
  })();

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <img
          src="/logo.png"
          alt="CARC"
          style={styles.logo}
          onError={(e) => {
            // si no encuentra la imagen, ocultala para que no moleste
            e.currentTarget.style.display = "none";
          }}
        />

        <h1 style={styles.title}>Control Acceso CARC</h1>
        <p style={styles.subtitle}>
          Sistema online funcionando <span style={{ fontSize: 16 }}>✅</span>
        </p>

        {/* Input + botón */}
        <div style={styles.form}>
          <label style={styles.label}>Ingresar DNI</label>

          <input
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Ej: 12345678"
            inputMode="numeric"
            type="text"
            style={styles.input}
          />

          <button
            onClick={buscar}
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {/* Mensaje no existe */}
        {error ? (
          <div style={{ ...styles.statusBox, ...estadoStyles }}>
            <b>{noExiste ? "PERSONA NO EXISTE" : error}</b>
          </div>
        ) : null}

        {/* Resultado */}
        {resultado ? (
          <div style={styles.resultBox}>
            <div style={{ ...styles.statusBox, ...estadoStyles }}>
              <b>{estadoTexto}</b>
            </div>

            <div style={styles.row}>
              <span style={styles.k}>DNI:</span>
              <span style={styles.v}>{resultado.dni}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.k}>Nombre:</span>
              <span style={styles.v}>{resultado.nombre}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.k}>Tipo de ingreso:</span>
              <span style={styles.v}>{resultado.tipo_ingreso || "-"}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.k}>Puerta de acceso:</span>
              <span style={styles.v}>{resultado.puerta || "-"}</span>
            </div>

            {/* Ubicación: solo si viene con algo */}
            {resultado.ubicacion ? (
              <div style={styles.row}>
                <span style={styles.k}>Ubicación:</span>
                <span style={styles.v}>{resultado.ubicacion}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={styles.footer}>
          Rosario Central 💙💛
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "#0b4fb3", // azul Central
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxSizing: "border-box",
    boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
    textAlign: "center",
  },
  logo: {
    width: 72,
    height: 72,
    objectFit: "contain",
    margin: "0 auto 8px auto",
    display: "block",
  },
  title: {
    margin: "6px 0 4px 0",
    color: "#0b4fb3",
    fontSize: 30,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: "0 0 16px 0",
    color: "#333",
    fontSize: 14,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "stretch",
    width: "100%",
    boxSizing: "border-box",
    marginTop: 6,
  },
  label: {
    textAlign: "left",
    fontSize: 13,
    color: "#1a1a1a",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 12px",
    borderRadius: 12,
    border: "2px solid #e6e6e6",
    outline: "none",
    fontSize: 18,
  },
  button: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#ffd400", // amarillo Central
    color: "#111",
    fontWeight: 800,
    fontSize: 16,
  },
  statusBox: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    textAlign: "center",
    boxSizing: "border-box",
  },
  resultBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    background: "#f8f8f8",
    boxSizing: "border-box",
    textAlign: "left",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid #e8e8e8",
  },
  k: { fontWeight: 700, color: "#222" },
  v: { color: "#111", textAlign: "right" },
  footer: {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 12,
    background: "#ffd400",
    fontWeight: 800,
    color: "#111",
  },
};
