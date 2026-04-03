import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()

    const systemPrompt = `Sos el asistente de Wallest, una empresa inmobiliaria española (Hasu Activos Inmobiliarios SL).
Respondés en español, de forma directa y concisa. Sos experto en inversión inmobiliaria, reformas y gestión de proyectos.
El CEO es Patricio Favora. El objetivo es llegar a 1M€ en cuenta HASU para diciembre 2027.

Contexto actual del sistema:
${context || 'Sin datos disponibles.'}

Respondé siempre en español. Sé directo, útil y profesional. Máximo 3 párrafos a menos que necesites más.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ text })
  } catch (err: any) {
    console.error('Chat API error:', err)
    return NextResponse.json({ text: 'Error al conectar con el asistente. Intentá de nuevo.' }, { status: 500 })
  }
}
