import { useState } from "react";

export default function Home() {
  const [dni, setDni] = useState("");
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  async function buscar() {
    setLoading(true);
    setResultado(null);
    try {
      const res = await fetch(`/api/buscar?dni=${encodeURIComponent(dni)}`);
      const data = await res.json();
      setResultado(data);
    } catch (e) {
      setResultado({ error: "Error de conexión" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "#0047ab",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "white",
          padding: 40,
          borderRadius: 20,
          width: 340,
          textAlign: "center",
        }}
      >
        <img src="/logo.png" width="80" alt="CARC" />

        <h1 style={{ color: "#0047ab", marginTop: 12 }}>Control Acceso CARC</h1>

        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="DNI"
          style={{ width: "100%", padding: 10, marginTop: 10 }}
        />

        <button
          onClick={buscar}
          disabled={!dni || loading}
          style={{
            marginTop: 10,
            background: "#ffd400",
            border: "none",
            padding: 10,
            width: "100%",
            borderRadius: 10,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>

        {resultado && (
          <div style={{ marginTop: 15 }}>
            {resultado.error ? (
              <p>{resultado.error === "Persona no encontrada" ? "No encontrado" : resultado.error}</p>
            ) : (
              <>
                <p>
                  <b>{resultado.nombre}</b>
                </p>
                <p>{resultado.sector}</p>
              </>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 14,
            background: "#ffd400",
            padding: 10,
            borderRadius: 10,
            fontWeight: "bold",
          }}
        >
          Rosario Central 💙💛
        </div>
      </div>
    </div>
  );
}
