'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function EdificiosRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/mercado?tipologia=edificio') }, [router])
  return null
}
