'use client'
import { useSearchParams } from 'next/navigation'
import BotChat from '@/components/BotChat'
import { Suspense } from 'react'

function BotPageInner() {
  const searchParams = useSearchParams()
  const proyectoId = searchParams.get('proyecto_id')
  return (
    <div style={{ height: 'calc(100vh - 70px)' }}>
      <BotChat proyectoId={proyectoId} />
    </div>
  )
}

export default function BotPage() {
  return (
    <Suspense>
      <BotPageInner />
    </Suspense>
  )
}
