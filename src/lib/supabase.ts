import { createClient } from '@supabase/supabase-js';

// Resilient fallbacks to prevent module-level crash on Vercel/production if environment variables are not yet configured in the dashboard.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project-ref.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3ODIxMDYsImV4cCI6Mjk5NTM1ODEwNn0.anon-placeholder';
const supabaseServiceRole = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4MjEwNiwiZXhwIjoyOTk1MzU4MTA2fQ.service-placeholder';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error(
    'CRITICAL: Supabase URL or Anon Key is missing! ' +
    'Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Vercel Project Environment Variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRole,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

