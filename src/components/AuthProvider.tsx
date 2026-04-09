'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'

type AuthContextValue = {
  authResolved: boolean
  session: Session | null
  user: User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authResolved, setAuthResolved] = useState(false)

  useEffect(() => {
    let cancelled = false

    const applySession = (nextSession: Session | null) => {
      if (cancelled) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setAuthResolved(true)
    }

    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      applySession(nextSession)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      authResolved,
      session,
      user,
    }),
    [authResolved, session, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
