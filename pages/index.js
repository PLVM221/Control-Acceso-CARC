export default function Home() {
  return (
    <div style={{
      background: "#0047AB",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        background: "white",
        padding: 40,
        borderRadius: 20,
        textAlign: "center",
        width: 350
      }}>

        <img 
          src="/logo.png" 
          alt="CARC" 
          style={{ width: 120, marginBottom: 15 }}
        />

        <h1 style={{ color: "#0047AB" }}>
          Control Acceso CARC
        </h1>

        <p>
          Sistema online funcionando ✅
        </p>

        <div style={{
          background: "#FFD100",
          padding: 10,
          borderRadius: 10,
          fontWeight: "bold",
          marginTop: 15
        }}>
          Rosario Central 💙💛
        </div>

      </div>
    </div>
  );
}
