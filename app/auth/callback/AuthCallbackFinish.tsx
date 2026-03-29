'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/src/lib/supabase'
import { clearOAuthReturnCookie, readOAuthReturnPath } from '@/src/lib/oauth-redirect'

export default function AuthCallbackFinish() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function run() {
      const next = readOAuthReturnPath()

      const {
        data: { session: existing },
      } = await supabase.auth.getSession()
      if (existing?.user) {
        clearOAuthReturnCookie()
        router.replace(next)
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          clearOAuthReturnCookie()
          router.replace(next)
          return
        }
        console.error('[auth/callback] exchangeCodeForSession', error.message)
        clearOAuthReturnCookie()
        router.replace('/?error=auth')
        return
      }

      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
      if (hash) {
        const p = new URLSearchParams(hash)
        const access_token = p.get('access_token')
        const refresh_token = p.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error) {
            clearOAuthReturnCookie()
            router.replace(next)
            return
          }
          console.error('[auth/callback] setSession', error.message)
        }
      }

      clearOAuthReturnCookie()
      router.replace('/?error=auth')
    }

    void run()
  }, [router, searchParams])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] p-4">
      <p className="text-sm text-zinc-500">Signing you in…</p>
    </main>
  )
}
