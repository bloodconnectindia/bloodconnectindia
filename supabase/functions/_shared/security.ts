import postgres from 'npm:postgres@3.4.5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const required = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}

export const sql = postgres(required('SUPABASE_DB_URL'), { prepare: false, max: 1 })
export const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
export const serviceAuth = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
export const cors = { 'Access-Control-Allow-Origin': required('APP_ORIGIN'), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Content-Type': 'application/json' }
export const originAllowed = (request: Request) => {
  const origin = request.headers.get('origin')
  return !origin || origin === required('APP_ORIGIN')
}
export const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors })
export const hash = async (value: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(required('SECURITY_HMAC_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(signed)].map(x => x.toString(16).padStart(2, '0')).join('')
}
export const bearerUser = async (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await serviceAuth.auth.getUser(token)
  return data.user ?? null
}
export const options = () => new Response(null, { headers: cors })
