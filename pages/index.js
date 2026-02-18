import Image from "next/image";

export default function Home() {
  const azul = "#0047AB";
  const amarillo = "#FFD100";

  return (
    <div style={{
      minHeight: "100vh",
      background: azul,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui"
    }}>
      <div style={{
        background: "white",
        borderRadius: 16,
        padding: 24,
        maxWidth: 420,
        width: "100%",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.3)"
      }}>
        <Image
          src="/escudo.png"
          width={140}
          height={140}
          alt="CARC"
        />

        <h1 style={{color: azul, marginTop: 12}}>
          Control Acceso CARC
        </h1>

        <p style={{color: "#333"}}>
          Sistema online funcionando ✅
        </p>

        <div style={{
          background: amarillo,
          padding: 10,
          borderRadius: 10,
          fontWeight: "bold"
        }}>
          Rosario Central 💙💛
        </div>
      </div>
    </div>
  );
}
