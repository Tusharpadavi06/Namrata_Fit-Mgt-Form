import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qdtmaimkoveommkgrpby.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdG1haW1rb3Zlb21ta2dycGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MzgyMjAsImV4cCI6MjEwMTMxNDIyMH0.20Qa2yAGFyL8gSBOsExT991_YyNSR2gYIS9X9dFvDac';

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
