import { useState, useEffect } from "react";

export default function Home() {
  const [dni, setDni] = useState("");
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("accesos") || "[]");
    setHistorial(saved);
  }, []);

  const guardarHistorial = (dni) => {
    const nuevo = {
      dni,
      fecha: new Date().toLocaleString(),
    };

    const actualizado = [nuevo, ...historial].slice(0, 10);
    setHistorial(actualizado);
    localStorage.setItem("accesos", JSON.stringify(actualizado));
  };

  const buscarDni = async (valor) => {
    setError("");
    setResultado(null);

    try {
      const res = await fetch(`/api/buscar?dni=${valor}`);
      const data = await res.json();

      if (!data.found) {
        setError("Persona no encontrada");
        guardarHistorial(valor);
        return;
      }

      setResultado(data.persona);
      guardarHistorial(valor);
    } catch {
      setError("Error de conexión con el servidor");
    }
  };

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    setDni(value);

    if (value.length === 8) {
      buscarDni(value);
    }
  };

  const limpiar = () => {
    setDni("");
    setResultado(null);
    setError("");
  };

  return (
    <div style={styles.fondo}>
      <div style={styles.card}>
        <img src="/logo.png" style={styles.logo} />

        <h1 style={styles.titulo}>Control Acceso CARC</h1>
        <p>Ingrese DNI para validar acceso</p>

        <div style={styles.buscador}>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength="8"
            value={dni}
            onChange={handleChange}
            placeholder="DNI (solo números)"
            style={styles.input}
          />

          <button style={styles.btnBuscar} onClick={() => buscarDni(dni)}>
            Buscar
          </button>
        </div>

        <button style={styles.btnLimpiar} onClick={limpiar}>
          Limpiar
        </button>

        <div style={styles.tip}>
          Tip: al llegar a 8 dígitos, busca solo.
        </div>

        {error && (
          <div
            style={{
              ...styles.estado,
              background:
                error === "Persona no encontrada" ? "#ff9800" : "#ffd6d6",
            }}
          >
            {error}
          </div>
        )}

        {resultado && (
          <div
            style={{
              ...styles.estado,
              background: resultado.cuota === 1 ? "#d4ffd4" : "#fff3b0",
            }}
          >
            <strong>{resultado.nombre}</strong>
            <br />
            Tipo ingreso: {resultado.tipoIngreso}
            <br />
            Puerta: {resultado.puertaAcceso}
            {resultado.ubicacion && (
              <>
                <br />
                Ubicación: {resultado.ubicacion}
              </>
            )}
            <br />
            {resultado.cuota === 1 ? "Cuota al día ✅" : "DEBE CUOTA ⚠️"}
          </div>
        )}

        <h3 style={{ marginTop: 20 }}>Últimos accesos (local)</h3>

        <div style={styles.historial}>
          {historial.length === 0 && "Todavía no hay registros."}
          {historial.map((h, i) => (
            <div key={i} style={styles.itemHistorial}>
              <span>{h.dni}</span>
              <span>{h.fecha}</span>
            </div>
          ))}
        </div>

        <div style={styles.footer}>Rosario Central</div>
      </div>
    </div>
  );
}

const styles = {
  fondo: {
    minHeight: "100vh",
    background: "#0b4db3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    background: "white",
    padding: 30,
    borderRadius: 20,
    width: "90%",
    maxWidth: 420,
    textAlign: "center",
  },
  logo: {
    width: 90,
    marginBottom: 10,
  },
  titulo: {
    color: "#0b4db3",
  },
  buscador: {
    display: "flex",
    gap: 10,
    marginTop: 15,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 18,
    borderRadius: 10,
    border: "1px solid #ccc",
  },
  btnBuscar: {
    background: "#ffd100",
    border: "none",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: "bold",
  },
  btnLimpiar: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: "none",
  },
  tip: {
    marginTop: 10,
    fontSize: 14,
    background: "#f3f3f3",
    padding: 8,
    borderRadius: 8,
  },
  estado: {
    marginTop: 15,
    padding: 12,
    borderRadius: 12,
    fontWeight: "bold",
  },
  historial: {
    marginTop: 10,
    maxHeight: 150,
    overflowY: "auto",
  },
  itemHistorial: {
    display: "flex",
    justifyContent: "space-between",
    background: "#ffe0c2",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
  },
  footer: {
    marginTop: 20,
    background: "#ffd100",
    padding: 10,
    borderRadius: 12,
    fontWeight: "bold",
  },
};
