import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const supabaseVerify = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function verifyAuth(
  req: NextRequest
): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseVerify.auth.getUser(token)
  if (error || !user) return null
  return { userId: user.id, email: user.email || '' }
}
