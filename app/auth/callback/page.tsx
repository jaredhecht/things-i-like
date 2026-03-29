import { Suspense } from 'react'
import AuthCallbackFinish from './AuthCallbackFinish'

function Fallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] p-4">
      <p className="text-sm text-zinc-500">Signing you in…</p>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuthCallbackFinish />
    </Suspense>
  )
}
