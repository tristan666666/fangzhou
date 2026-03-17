import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY

export const supabaseEnabled = Boolean(url && serviceRoleKey)
export const supabaseAuthEnabled = Boolean(url && serviceRoleKey && anonKey)

export const supabase = supabaseEnabled
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export const supabasePublic = supabaseAuthEnabled
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null
