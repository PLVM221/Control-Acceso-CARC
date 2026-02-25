import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // OJO: Supabase JS NO tiene TRUNCATE directo, lo hacemos con SQL via RPC
    // Necesitás crear esta función SQL una sola vez (te la dejo abajo).
    const { error } = await supabase.rpc("admin_reset_data");
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Reset failed", detail: e.message });
  }
}
