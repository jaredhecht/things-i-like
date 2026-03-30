import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service · Things I Like',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-zinc-600">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>

        <h1 className="text-2xl font-light tracking-tight text-zinc-900">Terms of Service</h1>
        <p className="mt-1 text-xs text-zinc-500">Things I Like · Last updated March 2026</p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">The short version</h2>
        <p className="mt-2 leading-relaxed">
          Be a good person. Post things you actually like. Don&apos;t post things that would hurt people. We can remove
          content or accounts that violate these terms.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your account</h2>
        <p className="mt-2 leading-relaxed">
          You&apos;re responsible for keeping your account secure. You must be at least 13 years old to use Things I
          Like.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your content</h2>
        <p className="mt-2 leading-relaxed">
          You own what you post. By posting it you give us a license to display it on the platform and to people who follow
          you. We don&apos;t claim ownership of your content and we don&apos;t use it for anything beyond running the
          service.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">What you can post</h2>
        <p className="mt-2 leading-relaxed">
          Things you genuinely like — music, books, articles, photos, quotes, videos, thoughts. Content should be yours to
          share or properly attributed.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">What you can&apos;t post</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
          <li>Content that is illegal</li>
          <li>Content that sexualizes minors — zero tolerance, reported to authorities</li>
          <li>Pornographic or sexually explicit content of any kind</li>
          <li>Harassment, threats, or targeted abuse of other users</li>
          <li>Spam or automated posts</li>
          <li>Content that infringes someone else&apos;s copyright or trademark</li>
          <li>Impersonation of other people or brands</li>
        </ul>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Embedded content</h2>
        <p className="mt-2 leading-relaxed">
          When you share a link to Spotify, YouTube, or another service, their content appears on your post. You&apos;re
          responsible for ensuring you have the right to share that content. We display it via their standard embed APIs.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Our rights</h2>
        <p className="mt-2 leading-relaxed">
          We can remove any content that violates these terms. We can suspend or terminate accounts that repeatedly violate
          these terms or that we determine are harmful to the community. We&apos;ll try to give you notice when we do this
          unless there&apos;s a legal or safety reason not to.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">The service</h2>
        <p className="mt-2 leading-relaxed">
          We provide Things I Like as-is. We try hard to keep it running but we don&apos;t guarantee uptime or that
          it&apos;ll work perfectly. We&apos;re not liable for losses resulting from using or being unable to use the
          service.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Changes</h2>
        <p className="mt-2 leading-relaxed">
          We may update these terms. If we make significant changes we&apos;ll notify you by email or by a prominent notice
          on the service. Continued use after changes means you accept the new terms.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Governing law</h2>
        <p className="mt-2 leading-relaxed">These terms are governed by the laws of the State of New York.</p>

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
