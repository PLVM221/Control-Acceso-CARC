import { useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
  const AZUL = "#0053A6";
  const AMARILLO = "#FFD200";

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const lastLookupRef = useRef({ dni: "", at: 0 });

  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState("idle"); // idle | ok | notfound | error
  const [persona, setPersona] = useState(null);
  const [msg, setMsg] = useState("");

  // Config “de puerta”
  const AUTO_SEARCH_MIN = 7;        // a partir de 7 dígitos
  const AUTO_SEARCH_MAX = 8;        // si llega a 8 busca seguro
  const DEBOUNCE_MS = 350;
  const DUPLICATE_BLOCK_MS = 8000;  // no repetir mismo DNI en 8s
  const HISTORY_KEY = "carc_access_history_v1";
  const HISTORY_MAX = 20;

  const history = useMemo(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []); // solo para init visual rápido

  const [hist, setHist] = useState(history);

  function nowISO() {
    return new Date().toISOString();
  }

  function saveHistory(entry) {
    const next = [entry, ...(hist || [])].slice(0, HISTORY_MAX);
    setHist(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }

  function beep(tipo) {
    // tipo: "ok" | "err"
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.value = tipo === "ok" ? 880 : 220; // ok agudo, error grave
      g.gain.value = 0.06;

      o.connect(g);
      g.connect(ctx.destination);

      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close?.();
      }, tipo === "ok" ? 120 : 220);
    } catch {}
  }

  function vibrate(tipo) {
    try {
      if (!navigator.vibrate) return;
      navigator.vibrate(tipo === "ok" ? [60] : [80, 50, 120]);
    } catch {}
  }

  function focusInput() {
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }

  function limpiar() {
    setDni("");
    setPersona(null);
    setMsg("");
    setEstado("idle");
    focusInput();
  }

  async function buscar(dniValor, { force = false } = {}) {
    const limpio = String(dniValor || "").replace(/\D/g, "");
    if (!limpio) {
      setEstado("error");
      setMsg("Ingresá un DNI");
      setPersona(null);
      beep("err");
      vibrate("err");
      return;
    }

    // anti doble lectura
    const t = Date.now();
    if (!force && lastLookupRef.current.dni === limpio && t - lastLookupRef.current.at < DUPLICATE_BLOCK_MS) {
      setMsg(`DNI ${limpio} recién consultado. (bloqueo ${Math.round(DUPLICATE_BLOCK_MS/1000)}s)`);
      return;
    }
    lastLookupRef.current = { dni: limpio, at: t };

    setLoading(true);
    setMsg("");
    setPersona(null);

    try {
      const r = await fetch(`/api/buscar?dni=${encodeURIComponent(limpio)}`);
      const j = await r.json().catch(() => ({}));

      if (r.ok) {
        setEstado("ok");
        setPersona(j);
        beep("ok");
        vibrate("ok");
        saveHistory({
          at: nowISO(),
          dni: j.dni || limpio,
          nombre: j.nombre || "",
          sector: j.sector || "",
          ok: true,
        });
      } else if (r.status === 404) {
        setEstado("notfound");
        setMsg("Persona no encontrada");
        beep("err");
        vibrate("err");
        saveHistory({ at: nowISO(), dni: limpio, ok: false });
      } else {
        setEstado("error");
        setMsg(j?.error || "Error del servidor");
        beep("err");
        vibrate("err");
        saveHistory({ at: nowISO(), dni: limpio, ok: false, error: "server" });
      }
    } catch {
      setEstado("error");
      setMsg("Error de conexión");
      beep("err");
      vibrate("err");
      saveHistory({ at: nowISO(), dni: limpio, ok: false, error: "network" });
    } finally {
      setLoading(false);
    }
  }

  // auto búsqueda con debounce
  useEffect(() => {
    const limpio = dni.replace(/\D/g, "");
    if (limpio.length < AUTO_SEARCH_MIN) return;

    // Si llega a 8 dígitos, busca rápido; si 7, debounce normal
    const wait = limpio.length >= AUTO_SEARCH_MAX ? 80 : DEBOUNCE_MS;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      buscar(limpio);
    }, wait);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dni]);

  useEffect(() => {
    focusInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgStatus =
    estado === "ok" ? "#E9FFF0" :
    estado === "notfound" ? "#FFECEC" :
    estado === "error" ? "#FFF3F3" :
    "#FFFFFF";

  const borderStatus =
    estado === "ok" ? "1px solid #93E6AA" :
    estado === "notfound" ? "1px solid #FFB3B3" :
    estado === "error" ? "1px solid #FFB3B3" :
    "1px solid #E6E6E6";

  return (
    <div style={{
      minHeight: "100vh",
      background: AZUL,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      fontFamily: "system-ui",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 560,
        background: "#fff",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        textAlign: "center",
      }}>
        <img src="/logo.png" alt="CARC" width="80" height="80" style={{ display: "block", margin: "0 auto 6px" }} />

        <h1 style={{ margin: "6px 0 4px", color: AZUL, fontSize: 32 }}>Control Acceso CARC</h1>
        <div style={{ opacity: 0.85, marginBottom: 10 }}>Ingrese DNI para validar acceso</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
            placeholder="DNI (solo números)"
            style={{
              flex: "1 1 260px",
              padding: "14px 14px",
              borderRadius: 12,
              border: "1px solid #cfd6dd",
              fontSize: 22,     // números grandes
              fontWeight: 800,
              letterSpacing: 1,
              outline: "none",
            }}
          />

          <button
            onClick={() => buscar(dni, { force: true })}
            disabled={loading || !dni}
            style={{
              flex: "0 0 auto",
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              background: AMARILLO,
              fontWeight: 900,
              cursor: "pointer",
              minWidth: 120,
              fontSize: 18,
            }}
          >
            {loading ? "..." : "Buscar"}
          </button>

          <button
            onClick={limpiar}
            style={{
              flex: "0 0 auto",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              minWidth: 120,
              fontSize: 18,
            }}
          >
            Limpiar
          </button>
        </div>

        <div style={{ marginTop: 14, background: bgStatus, border: borderStatus, borderRadius: 14, padding: 14, textAlign: "left" }}>
          {estado === "ok" && persona && (
            <>
              <div style={{ fontWeight: 1000, fontSize: 18, color: "#0A5D2A" }}>✅ HABILITADO</div>
              <div style={{ marginTop: 8, fontSize: 18 }}><b>Nombre:</b> {persona.nombre}</div>
              <div style={{ marginTop: 6, fontSize: 18 }}><b>Sector:</b> {persona.sector}</div>
              <div style={{ marginTop: 6, fontSize: 16, opacity: 0.75 }}><b>DNI:</b> {persona.dni}</div>
            </>
          )}

          {estado === "notfound" && (
            <div style={{ fontWeight: 1000, fontSize: 18, color: "#8A0000" }}>⛔ Persona no encontrada</div>
          )}

          {estado === "error" && (
            <div style={{ fontWeight: 1000, fontSize: 18, color: "#8A0000" }}>⚠️ {msg || "Error"}</div>
          )}

          {estado === "idle" && (
            <div style={{ fontWeight: 800, fontSize: 16, opacity: 0.75 }}>
              Tip: al llegar a 7–8 dígitos, busca solo.
            </div>
          )}

          {msg && estado !== "error" && (
            <div style={{ marginTop: 10, fontSize: 14, opacity: 0.8 }}>{msg}</div>
          )}
        </div>

        {/* Historial */}
        <div style={{ marginTop: 14, textAlign: "left" }}>
          <div style={{ fontWeight: 900, marginBottom: 8, color: AZUL }}>Últimos accesos (local)</div>
          <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #eee", borderRadius: 12 }}>
            {hist?.length ? (
              hist.map((h, i) => (
                <div key={i} style={{
                  padding: "10px 12px",
                  borderBottom: i === hist.length - 1 ? "none" : "1px solid #f0f0f0",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: h.ok ? "#F7FFFA" : "#FFF7F7",
                }}>
                  <div style={{ fontWeight: 800 }}>
                    {h.ok ? "✅" : "⛔"} {h.dni}
                    {h.nombre ? <span style={{ fontWeight: 700, opacity: 0.8 }}> — {h.nombre}</span> : null}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {new Date(h.at).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 12, opacity: 0.7 }}>Todavía no hay registros.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 16, background: AMARILLO, borderRadius: 12, padding: 10, fontWeight: 1000 }}>
          Rosario Central 💙💛
        </div>
      </div>
    </div>
  );
}
