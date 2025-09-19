import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE!;

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
