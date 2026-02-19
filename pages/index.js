import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

function extraerDni(texto) {
  const m = String(texto).match(/\b\d{7,9}\b/);
  return m ? m[0] : "";
}

export default function Home() {
  const azul = "#0047AB";
  const amarillo = "#FFD100";

  const videoRef = useRef(null);
  const readerRef = useRef(null);

  const [dni, setDni] = useState("");
  const [estado, setEstado] = useState("idle"); // idle | scanning | loading | ok | notfound | error
  const [persona, setPersona] = useState(null);
  const [msg, setMsg] = useState("");

  async function buscar(dniValor) {
    const valor = String(dniValor || "").trim();
    if (!valor) return;

    setEstado("loading");
    setPersona(null);
    setMsg("");

    try {
      const r = await fetch(`/api/buscar?dni=${encodeURIComponent(valor)}`);
      const j = await r.json();

      if (!r.ok) {
        setEstado("notfound");
        setMsg(j?.error || "Persona no encontrada");
        return;
      }

      setEstado("ok");
      setPersona(j.data);
    } catch {
      setEstado("error");
      setMsg("Error de conexión");
    }
  }

  async function iniciarCamara() {
    setMsg("");
    setPersona(null);
    setEstado("scanning");

    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const constraints = { video: { facingMode: { ideal: "environment" } }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      reader.decodeFromVideoElementContinuously(videoRef.current, (result) => {
        if (result) {
          const text = result.getText?.() ?? String(result);
          const dniLeido = extraerDni(text);

          if (dniLeido) {
            setDni(dniLeido);
            detenerCamara();
            buscar(dniLeido);
          } else {
            setMsg("Leí el código, pero no pude extraer el DNI. Acercá un poco más.");
          }
        }
      });
    } catch {
      setEstado("error");
      setMsg("No pude acceder a la cámara. Revisá permisos del navegador.");
    }
  }

  function detenerCamara() {
    try {
      readerRef.current?.reset();
    } catch {}

    const v = videoRef.current;
    const stream = v?.srcObject;
    if (stream?.getTracks) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;

    setEstado("idle");
  }

  useEffect(() => {
    return () => detenerCamara();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deshabilitado = estado === "loading" || estado === "scanning";

  return (
    <div style={{ minHeight: "100vh", background: azul, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 16, padding: 24, maxWidth: 460, width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,.3)" }}>
        <img src="/logo.png" alt="CARC" width="90" height="90" style={{ display: "block", margin: "0 auto 8px auto" }} />

        <h1 style={{ color: azul, marginTop: 8 }}>Control Acceso CARC</h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>Sistema online funcionando ✅</p>

        {/* Input + cámara */}
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <input
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            placeholder="Ingresá DNI"
            inputMode="numeric"
            style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #ddd", fontSize: 16 }}
            disabled={deshabilitado}
          />

          <button
            onClick={iniciarCamara}
            disabled={estado === "scanning" || estado === "loading"}
            title="Escanear DNI"
            style={{ width: 52, height: 48, borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 20 }}
          >
            📷
          </button>
        </div>

        <button
          onClick={() => buscar(dni)}
          disabled={!dni.trim() || deshabilitado}
          style={{ marginTop: 10, width: "100%", background: amarillo, border: "none", padding: 12, borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}
        >
          {estado === "loading" ? "Buscando..." : "Buscar"}
        </button>

        {/* Panel cámara */}
        {estado === "scanning" && (
          <div style={{ marginTop: 14, textAlign: "left" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Apuntá al PDF417 del DNI (dorso)</div>

            <video ref={videoRef} style={{ width: "100%", borderRadius: 12, border: "1px solid #ddd" }} playsInline muted />

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                onClick={detenerCamara}
                style={{ flex: 1, background: "#111", color: "white", border: "none", padding: 10, borderRadius: 10, fontWeight: 700, cursor: "pointer" }}
              >
                Cerrar cámara
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              Tip: buena luz y acercate hasta que el código se vea nítido.
            </div>
          </div>
        )}

        {/* Resultados */}
        {estado === "ok" && persona && (
          <div style={{ marginTop: 14, textAlign: "left", background: "#f6f7f9", padding: 12, borderRadius: 12, border: "1px solid #e8eaee" }}>
            <div><b>DNI:</b> {persona.dni}</div>
            <div><b>Nombre:</b> {persona.nombre}</div>
            <div><b>Sector:</b> {persona.nombre}</div>
          </div>
        )}

        {(estado === "notfound" || estado === "error") && (
          <div style={{ marginTop: 14, color: "#b00020", fontWeight: 700 }}>{msg}</div>
        )}

        {msg && estado === "idle" && (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>{msg}</div>
        )}

        <div style={{ marginTop: 16, background: amarillo, padding: 10, borderRadius: 10, fontWeight: "bold" }}>
          Rosario Central
        </div>
      </div>
    </div>
  );
}
