
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { dni } = req.query;

  const filePath = path.join(process.cwd(), 'data', 'personas.json');

  if (!fs.existsSync(filePath)) {
    return res.status(500).json({ error: "Base no cargada" });
  }

  const rawData = fs.readFileSync(filePath);
  const personas = JSON.parse(rawData);

  const persona = personas.find(p => p.dni === dni);

  if (!persona) {
    return res.status(404).json({ error: "No encontrado" });
  }

  res.status(200).json(persona);
}
