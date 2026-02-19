import personas from "../../data/personas.json";

export default function handler(req, res) {
  const { dni } = req.query;

  if (!dni) {
    return res.status(400).json({ found: false, error: "DNI requerido" });
  }

  const persona = personas.find(p => p.dni === dni);

  if (!persona) {
    return res.status(200).json({ found: false });
  }

  return res.status(200).json({
    found: true,
    persona
  });
}
