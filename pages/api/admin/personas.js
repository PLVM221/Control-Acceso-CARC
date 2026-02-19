import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "personas.json");

function readJson() {
  if (!fs.existsSync(DATA_PATH)) return [];
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  return JSON.parse(raw || "[]");
}

function writeJson(arr) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(arr, null, 2), "utf8");
}

function isAuth(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  return !!token; // demo simple
}

export default function handler(req, res) {
  if (!isAuth(req)) return res.status(401).json({ ok: false, error: "No autorizado" });

  if (req.method === "GET") {
    const personas = readJson();
    return res.status(200).json({ ok: true, personas });
  }

  if (req.method === "POST") {
    const { modo, personas } = req.body || {};
    if (!Array.isArray(personas)) {
      return res.status(400).json({ ok: false, error: "personas debe ser array" });
    }

    const actuales = readJson();

    // Normalizamos nombres de campos esperados
    const normalizadas = personas.map((p) => ({
      dni: String(p.dni || "").trim(),
      nombre: String(p.nombre || "").trim(),
      tipoIngreso: String(p.tipoIngreso || "").trim(),
      puertaAcceso: String(p.puertaAcceso || "").trim(),
      ubicacion: String(p.ubicacion || "").trim(),
      cuota: Number(p.cuota ?? 1), // 1 por defecto
    })).filter(p => p.dni);

    let nuevas = actuales;

    if (modo === "REEMPLAZAR") {
      nuevas = normalizadas;
    } else if (modo === "AGREGAR") {
      // Agrega/actualiza por DNI
      const map = new Map(actuales.map(p => [String(p.dni), p]));
      for (const p of normalizadas) map.set(String(p.dni), p);
      nuevas = Array.from(map.values());
    } else {
      return res.status(400).json({ ok: false, error: "modo debe ser REEMPLAZAR o AGREGAR" });
    }

    writeJson(nuevas);
    return res.status(200).json({ ok: true, total: nuevas.length });
  }

  return res.status(405).json({ ok: false });
}
