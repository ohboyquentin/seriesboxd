import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://sjahjgexkjklzkqglkix.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqYWhqZ2V4a2prbHprcWdsa2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDExOTYsImV4cCI6MjA5NjY3NzE5Nn0.h3M2zPDLklFIrMMC2aTEuhtacn1w-cW9SsuUw4e5_t8";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
