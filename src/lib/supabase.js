import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// to use: import { supabase } from '@/lib/supabase'. (@ means the src folder.)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

