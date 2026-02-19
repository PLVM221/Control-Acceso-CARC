export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: "Falta ADMIN_PASSWORD en Vercel" });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Clave incorrecta" });
  }

  // Token simple (para demo). En producción se haría JWT/cookies seguras.
  const token = Buffer.from(`admin:${Date.now()}`).toString("base64");
  return res.status(200).json({ ok: true, token });
}
