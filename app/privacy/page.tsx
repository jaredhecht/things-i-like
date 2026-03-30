import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy · Things I Like',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-zinc-600">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>

        <h1 className="text-2xl font-light tracking-tight text-zinc-900">Privacy Policy</h1>
        <p className="mt-1 text-xs text-zinc-500">Things I Like · Last updated March 2026</p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">What we collect</h2>
        <p className="mt-2 leading-relaxed">
          When you create an account we collect your email address and the information you choose to share — your name,
          photo, bio, and the things you post. We also collect standard server logs including IP addresses and browser
          type.
        </p>
        <p className="mt-3 leading-relaxed">
          If you connect Google for sign-in, we receive your name, email, and profile photo from Google. We don&apos;t
          receive any other data from your Google account.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">What we don&apos;t collect</h2>
        <p className="mt-2 leading-relaxed">
          We don&apos;t sell your data. We don&apos;t run ads. We don&apos;t share your information with third parties
          except as described below.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">How we use it</h2>
        <p className="mt-2 leading-relaxed">
          To operate the service — showing your posts to people who follow you, sending you notifications you&apos;ve asked
          for, and letting you sign in. That&apos;s it.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Third parties</h2>
        <p className="mt-2 leading-relaxed">
          We use Supabase to store your data and the media you upload (for example post images). Supabase is an
          infrastructure provider with its own privacy policy. We may use Anthropic&apos;s API to power AI features like
          link enrichment — content you submit for these features may be processed by Anthropic per their privacy policy.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your data</h2>
        <p className="mt-2 leading-relaxed">
          You can delete your account at any time from Settings. When you do, your posts and profile are permanently
          deleted within 30 days. You can export your data by contacting us.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Cookies</h2>
        <p className="mt-2 leading-relaxed">
          We use cookies only to keep you signed in. No tracking cookies, no analytics cookies.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Children</h2>
        <p className="mt-2 leading-relaxed">
          Things I Like is not intended for anyone under 13 and does not permit adult or sexually explicit content of any
          kind. If you encounter such content please report it immediately.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Contact</h2>
        <p className="mt-2 leading-relaxed">
          Questions? Email us at{' '}
          <a
            href="mailto:hello@thingsilike.app"
            className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950"
          >
            hello@thingsilike.app
          </a>
        </p>
      </div>
    </main>
  )
}
