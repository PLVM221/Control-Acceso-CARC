import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // No tirar error en build; lo validamos en runtime en las API routes
  // para que puedas deployar y configurar env vars luego.
}

export const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "", {
  auth: { persistSession: false },
});
