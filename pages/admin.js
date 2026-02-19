import { useState } from "react";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [modo, setModo] = useState("AGREGAR");
  const [jsonText, setJsonText] = useState(`[
  {
    "dni":"25328387",
    "nombre":"Martin Lagamma",
    "tipoIngreso":"Empleado",
    "puertaAcceso":"Puerta 1-2-3-4-5-10",
    "ubicacion":"Total",
    "cuota":1
  }
]`);

  const login = async () => {
    setMsg("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!data.ok) return setMsg(data.error || "Error");
    setToken(data.token);
    setMsg("✅ Logueado");
  };

  const guardar = async () => {
    setMsg("");
    let personas;
    try {
      personas = JSON.parse(jsonText);
    } catch {
      return setMsg("❌ JSON inválido");
    }

    const res = await fetch("/api/admin/personas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ modo, personas }),
    });

    const data = await res.json();
    if (!data.ok) return setMsg(data.error || "Error");
    setMsg(`✅ OK. Total en base: ${data.total}`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b4db3", padding: 20 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", background: "#fff", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Admin — Control Acceso CARC</h1>

        {!token ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="password"
              placeholder="Clave admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 240 }}
            />
            <button onClick={login} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#ffd100", fontWeight: "bold" }}>
              Entrar
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <label style={{ fontWeight: "bold" }}>Modo de carga:</label>
              <select value={modo} onChange={(e) => setModo(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
                <option value="AGREGAR">AGREGAR (no borra, actualiza por DNI)</option>
                <option value="REEMPLAZAR">REEMPLAZAR (borra todo y carga nuevo)</option>
              </select>
              <button onClick={guardar} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#0b4db3", color: "white", fontWeight: "bold" }}>
                Guardar listado
              </button>
            </div>

            <p style={{ marginTop: 0, color: "#333" }}>
              Pegá acá tu listado en formato <b>JSON</b> (después agregamos CSV).
            </p>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={{ width: "100%", minHeight: 340, padding: 12, borderRadius: 12, border: "1px solid #ccc", fontFamily: "monospace" }}
            />
          </>
        )}

        {msg && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#f3f3f3" }}>
            {msg}
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 13, color: "#666" }}>
          Ruta: <b>/admin</b>
        </div>
      </div>
    </div>
  );
}
