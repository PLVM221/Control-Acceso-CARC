import { useState, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function Home() {
  const [dni, setDni] = useState("");
  const [resultado, setResultado] = useState(null);
  const videoRef = useRef(null);
  const scanner = new BrowserMultiFormatReader();

  async function buscar(valor) {
    const res = await fetch(`/api/buscar?dni=${valor}`);
    const data = await res.json();
    setResultado(data);
  }

  async function abrirCamara() {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    const deviceId = devices[0].deviceId;

    scanner.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
      if (result) {
        const valor = result.getText();
        setDni(valor);
        buscar(valor);
        scanner.reset();
      }
    });
  }

  return (
    <div style={{
      background:"#0047ab",
      minHeight:"100vh",
      display:"flex",
      alignItems:"center",
      justifyContent:"center"
    }}>
      <div style={{
        background:"white",
        padding:40,
        borderRadius:20,
        width:320,
        textAlign:"center"
      }}>
        <img src="/logo.png" width="80" />

        <h1 style={{color:"#0047ab"}}>Control Acceso CARC</h1>

        <div style={{display:"flex", gap:5}}>
          <input
            value={dni}
            onChange={e => setDni(e.target.value)}
            placeholder="DNI"
            style={{flex:1,padding:10}}
          />
          <button onClick={abrirCamara}>📷</button>
        </div>

        <button
          onClick={() => buscar(dni)}
          style={{
            marginTop:10,
            background:"#ffd400",
            border:"none",
            padding:10,
            width:"100%",
            borderRadius:10
          }}
        >
          Buscar
        </button>

        <video ref={videoRef} style={{width:"100%",marginTop:10}} />

        {resultado && (
          <div style={{marginTop:15}}>
            {resultado.error ? (
              <p>No encontrado</p>
            ) : (
              <>
                <p><b>{resultado.nombre}</b></p>
                <p>{resultado.sector}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
