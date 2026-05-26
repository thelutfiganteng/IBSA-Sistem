import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types'; // We'll generate this or use any for now

// Using VITE_ prefixed env variables so they are exposed to the client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = createClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2ZiZmR3c2R1cGxmd2RoeGluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4MjEwNiwiZXhwIjoyMDk1MzU4MTA2fQ.FdpRWKk8yZRyow7d1GfMSsJjp_vKFIn6lREFO4hHE-k",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

