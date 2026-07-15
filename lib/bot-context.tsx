'use client'

export function openBotPanel() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wos:open-bot'))
  }
}

export function closeBotPanel() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wos:close-bot'))
  }
}

export function clearBotPanel() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wos:clear-bot'))
  }
}

// Legacy hook shim — usable in client components
export function useBotPanel() {
  return { openBot: openBotPanel, closeBot: closeBotPanel }
}
