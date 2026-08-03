import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your settings.");
}

// Fallback to a safe client that won't throw on initialization but will fail on calls gracefully
// Enable session persistence so OAuth logins are maintained across reloads
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-none.supabase.co',
  supabaseAnonKey || 'placeholder-none',
  {
    auth: {
      persistSession: true
    }
  }
);
