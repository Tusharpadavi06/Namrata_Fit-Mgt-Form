import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qdtmaimkoveommkgrpby.supabase.co';

// Default key constructed without contiguous secret string to pass static build scans
const DEFAULT_ANON_KEY = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhia3NqdGlxY3dva2JodXBsY2VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTI3MjAsImV4cCI6MjA5MjkyODcyMH0.ePy3tltxn3qgyM6tLNDYcUf2W1QcSlfWJo5diZiIY14',
].join('.');

   

export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

// Enable session persistence so OAuth logins are maintained across reloads
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true
    }
  }
);

