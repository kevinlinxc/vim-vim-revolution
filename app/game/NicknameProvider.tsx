'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface NicknameContextValue {
  userId: string
  nickname: string | null
  setNickname: (name: string) => void
  clearNickname: () => void
}

const NicknameContext = createContext<NicknameContextValue>({
  userId: '',
  nickname: null,
  setNickname: () => {},
  clearNickname: () => {},
})

export function useNickname() {
  return useContext(NicknameContext)
}

function generateUserId(): string {
  return String(Math.floor(Math.random() * 9007199254740991))
}

export default function NicknameProvider({ children }: { children: React.ReactNode }) {
  const [userId] = useState<string>(() => generateUserId())

  useEffect(() => {
    const stored = localStorage.getItem('userId')
    if (!stored) {
      localStorage.setItem('userId', userId)
    }
  }, [userId])

  const [nickname, setNicknameState] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('nickname')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setNicknameState(stored)
  }, [])

  const setNickname = useCallback((name: string) => {
    localStorage.setItem('nickname', name)
    setNicknameState(name)
  }, [])

  const clearNickname = useCallback(() => {
    localStorage.removeItem('nickname')
    setNicknameState(null)
  }, [])

  return (
    <NicknameContext.Provider value={{ userId, nickname, setNickname, clearNickname }}>
      {children}
    </NicknameContext.Provider>
  )
}
