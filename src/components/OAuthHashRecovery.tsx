'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/src/lib/supabase'
import { clearOAuthReturnCookie, readOAuthReturnPath } from '@/src/lib/oauth-redirect'

/**
 * If Supabase returns tokens in the URL hash but the user lands on `/` (e.g. after a
 * failed server callback), recover the session client-side and send them to the
 * intended path from the OAuth cookie.
 */
export function OAuthHashRecovery() {
  const pathname = usePathname()
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    if (pathname === '/auth/callback') return
    if (typeof window === 'undefined') return

    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return

    const p = new URLSearchParams(hash)
    const at = p.get('access_token')
    const rt = p.get('refresh_token')
    if (!at || !rt) return

    ran.current = true

    async function run() {
      const { error } = await supabase.auth.setSession({ access_token: at!, refresh_token: rt! })
      const next = readOAuthReturnPath()
      clearOAuthReturnCookie()

      const q = new URLSearchParams(window.location.search)
      q.delete('error')
      const search = q.toString()
      const pathOnly = pathname + (search ? `?${search}` : '')
      window.history.replaceState(null, '', pathOnly || '/')

      if (!error) router.replace(next)
      else router.replace('/?error=auth')
    }

    void run()
  }, [pathname, router])

  return null
}
