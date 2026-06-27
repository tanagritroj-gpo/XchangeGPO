// lib/supabase/config.ts
export const supabaseConfig = {
  url: process.env.SUPABASE_URL || '',
  key: process.env.SUPABASE_ANON_KEY || '',
};

if (!supabaseConfig.url || !supabaseConfig.key) {
  console.error("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.error("SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY);
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be defined in your .env.local");
}