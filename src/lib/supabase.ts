import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types'; // We'll generate this or use any for now

// Using VITE_ prefixed env variables so they are exposed to the client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
