import { useEffect, useRef, useState } from "react";

export default function Home() {
  const AZUL = "#0053A6";
  const AMARILLO = "#FFD200";

  const VERDE_BG = "#E9FFF0";
  const AMARILLO_BG = "#FFF8D6";
  const NARANJA_BG = "#FFE2B5";
  const ROJO_BG = "#FFF3F3";

  const debounceRef = useRef(null);

  const [dni, setDni] = useState("");
  const [estado, setEstado] = useState("idle"); 
  // idle | ok | debt | notfound | error

  const [persona, setPersona] = useState(null);
  const [msg, setMsg] = useState("");

  async function buscar(valor) {
    const limpio = valor.replace(/\D/g, "");
    if (!limpio) return;

    try {
      const r = await fetch(`/api/buscar?dni=${limpio}`);
      const j = await r.json();

      if (!r.ok) {
        setEstado("notfound");
        setPersona(null);
        return;
      }

      setPersona(j);

      const cuotaOk = String(j.cuota) === "1";
      setEstado(cuotaOk ? "ok" : "debt");

    } catch {
      setEstado("error");
      setMsg("Error de conexión");
    }
  }

  useEffect(() => {
    if (dni.length >= 7) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => buscar(dni), 250);
    }
  }, [dni]);

  return (
    <div style={{
      minHeight: "100vh",
      background: AZUL,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      fontFamily: "system-ui"
    }}>
      <div style={{
        background: "white",
        padding: 22,
        borderRadius: 18,
        maxWidth: 520,
        width: "100%",
        textAlign: "center",
        boxShadow: "0 12px 40px rgba(0,0,0,.25)"
      }}>
        <img src="/logo.png" width="80" alt="CARC" />

        <h1 style={{ color: AZUL, margin: "8px 0" }}>
          Control Acceso CARC
        </h1>

        <input
          type="tel"
          inputMode="numeric"
          value={dni}
          onChange={e => setDni(e.target.value.replace(/\D/g, ""))}
          placeholder="Ingresar DNI"
          style={{
            width: "100%",
            padding: 14,
            fontSize: 22,
            borderRadius: 12,
            border: "1px solid #ccc",
            marginTop: 10,
            textAlign: "center",
            fontWeight: 800
          }}
        />

        <div style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 16,
          background:
            estado === "ok" ? VERDE_BG :
            estado === "debt" ? AMARILLO_BG :
            estado === "notfound" ? NARANJA_BG :
            estado === "error" ? ROJO_BG :
            "#fff"
        }}>

          {estado === "ok" && persona && (
            <>
              <h2 style={{ color: "#0a5d2a" }}>✅ HABILITADO</h2>
              <p><b>{persona.nombre}</b></p>
              <p>Tipo de ingreso: {persona.tipoIngreso}</p>
              <p>Puerta de acceso: {persona.puerta}</p>
              {persona.ubicacion && <p>Ubicación: {persona.ubicacion}</p>}
              <p style={{fontWeight:800}}>✔ Cuota al día</p>
            </>
          )}

          {estado === "debt" && persona && (
            <>
              <h2 style={{ color: "#9b7a00" }}>⚠️ DEBE CUOTA</h2>
              <p><b>{persona.nombre}</b></p>
              <p>Tipo de ingreso: {persona.tipoIngreso}</p>
              <p>Puerta de acceso: {persona.puerta}</p>
              {persona.ubicacion && <p>Ubicación: {persona.ubicacion}</p>}
              <p style={{fontWeight:800}}>⚠ Cuota impaga</p>
            </>
          )}

          {estado === "notfound" && (
            <h2 style={{ color: "#B45300" }}>⛔ Persona no registrada</h2>
          )}

          {estado === "error" && (
            <h2 style={{ color: "#8a0000" }}>⚠️ {msg}</h2>
          )}

        </div>

        <div style={{
          marginTop: 16,
          background: AMARILLO,
          padding: 10,
          borderRadius: 12,
          fontWeight: 900
        }}>
          Rosario Central
        </div>
      </div>
    </div>
  );
}
