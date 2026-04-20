import { supabase } from './supabase'

/**
 * fetch wrapper that automatically adds the Supabase Bearer token to every request.
 * Use this for all calls to protected API routes (/api/chat, /api/proyectos, /api/google/*, /api/invite).
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  })
}
