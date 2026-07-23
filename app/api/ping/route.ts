export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_TIME ?? '0' },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
