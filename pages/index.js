import { useState, useEffect } from "react";

export default function Home() {
  const [dni, setDni] = useState("");
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState([]);

  const buscarDni = async (valor) => {
    try {
      setError("");
      const res = await fetch(`/api/buscar?dni=${valor}`);
      const data = await res.json();

      if (!data.found) {
        setResultado("no-existe");
        return;
      }

      setResultado(data.persona);

      const nuevo = {
        dni: valor,
        fecha: new Date().toLocaleString(),
      };

      setHistorial((prev) => [nuevo, ...prev.slice(0, 4)]);
    } catch {
      setError("Error de conexión con el servidor.");
    }
  };

  // 🔥 SOLO busca cuando llega a 8 dígitos
  useEffect(() => {
    if (dni.length === 8) {
      buscarDni(dni);
    }
  }, [dni]);

  const limpiar = () => {
    setDni("");
    setResultado(null);
    setError("");
  };

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        <img src="/logo.png" width="90" />

        <h1 style={styles.title}>Control Acceso CARC</h1>
        <p>Ingrese DNI para validar acceso</p>

        <div style={styles.row}>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="DNI (8 dígitos)"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
            style={styles.input}
          />

          <button onClick={() => buscarDni(dni)} style={styles.btn}>
            Buscar
          </button>
        </div>

        <button onClick={limpiar} style={styles.clear}>Limpiar</button>

        <div style={styles.tip}>
          Tip: al llegar a 8 dígitos, busca solo.
        </div>

        {resultado === "no-existe" && (
          <div style={styles.noExiste}>❗ No existe en el padrón</div>
        )}

        {resultado && resultado !== "no-existe" && (
          <div style={{
            ...styles.resultado,
            background: resultado.cuota === 0 ? "#ffe08a" : "#d4f8d4"
          }}>
            <strong>{resultado.nombre}</strong><br />
            Tipo ingreso: {resultado.tipoIngreso}<br />
            Puerta: {resultado.puertaAcceso}<br />
            {resultado.ubicacion && <>Ubicación: {resultado.ubicacion}<br /></}
            {resultado.cuota === 0 && (
              <strong style={{color:"#b00000"}}>Debe cuota</strong>
            )}
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <h3 style={{marginTop:20}}>Últimos accesos (local)</h3>

        {historial.length === 0 && <p>Sin registros.</p>}

        {historial.map((h, i) => (
          <div key={i} style={styles.histItem}>
            {h.dni} — {h.fecha}
          </div>
        ))}

        <div style={styles.footer}>
          Rosario Central 💙💛
        </div>
      </div>
    </div>
  );
}

const styles = {
  bg: {
    minHeight: "100vh",
    background: "#004aad",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Lexend, sans-serif"
  },
  card: {
    background: "#fff",
    padding: 30,
    borderRadius: 20,
    width: 360,
    textAlign: "center"
  },
  title: {
    color: "#004aad",
    marginBottom: 5
  },
  row: {
    display: "flex",
    gap: 10,
    marginTop: 10
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 18,
    borderRadius: 12,
    border: "1px solid #ccc"
  },
  btn: {
    background: "#ffd400",
    border: "none",
    padding: "12px 18px",
    borderRadius: 12,
    fontWeight: "bold",
    cursor: "pointer"
  },
  clear: {
    marginTop: 10,
    padding: 8,
    borderRadius: 10,
    border: "none",
    background: "#eee",
    cursor: "pointer"
  },
  tip: {
    marginTop: 12,
    padding: 10,
    background: "#f3f3f3",
    borderRadius: 10,
    fontSize: 14
  },
  resultado: {
    marginTop: 15,
    padding: 12,
    borderRadius: 12
  },
  noExiste: {
    marginTop: 15,
    background: "orange",
    padding: 12,
    borderRadius: 12,
    fontWeight: "bold"
  },
  error: {
    marginTop: 15,
    background: "#ffb3b3",
    padding: 12,
    borderRadius: 12
  },
  histItem: {
    background: "#eee",
    marginTop: 5,
    padding: 6,
    borderRadius: 8,
    fontSize: 13
  },
  footer: {
    marginTop: 20,
    background: "#ffd400",
    padding: 10,
    borderRadius: 12,
    fontWeight: "bold"
  }
};
