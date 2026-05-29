'use client'
import { createContext, useContext, useState } from 'react'

type BotContextType = {
  botOpen: boolean
  openBot: () => void
  closeBot: () => void
}

export const BotContext = createContext<BotContextType>({
  botOpen: false,
  openBot: () => {},
  closeBot: () => {},
})

export function useBotPanel() {
  return useContext(BotContext)
}

export function BotProvider({ children }: { children: React.ReactNode }) {
  const [botOpen, setBotOpen] = useState(false)
  return (
    <BotContext.Provider value={{ botOpen, openBot: () => setBotOpen(true), closeBot: () => setBotOpen(false) }}>
      {children}
    </BotContext.Provider>
  )
}
