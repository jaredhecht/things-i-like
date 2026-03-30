/** Legal copy for the home / dashboard page only. */
export function HomeLegalFooter() {
  return (
    <footer className="mt-16 border-t border-zinc-200 pt-10 pb-6 text-sm text-zinc-600">
      <div className="space-y-12">
        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="text-base font-semibold text-zinc-900">
            Privacy Policy
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Things I Like · Last updated March 2026</p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">What we collect</h3>
          <p className="mt-2 leading-relaxed">
            When you create an account we collect your email address and the information you choose to share — your name,
            photo, bio, and the things you post. We also collect standard server logs including IP addresses and browser
            type.
          </p>
          <p className="mt-3 leading-relaxed">
            If you connect Google for sign-in, we receive your name, email, and profile photo from Google. We don&apos;t
            receive any other data from your Google account.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">What we don&apos;t collect</h3>
          <p className="mt-2 leading-relaxed">
            We don&apos;t sell your data. We don&apos;t run ads. We don&apos;t share your information with third parties
            except as described below.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">How we use it</h3>
          <p className="mt-2 leading-relaxed">
            To operate the service — showing your posts to people who follow you, sending you notifications you&apos;ve
            asked for, and letting you sign in. That&apos;s it.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Third parties</h3>
          <p className="mt-2 leading-relaxed">
            We use Supabase to store your data and the media you upload (for example post images). Supabase is an
            infrastructure provider with its own privacy policy. We may use Anthropic&apos;s API to power AI features like
            link enrichment — content you submit for these features may be processed by Anthropic per their privacy policy.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your data</h3>
          <p className="mt-2 leading-relaxed">
            You can delete your account at any time from Settings. When you do, your posts and profile are permanently
            deleted within 30 days. You can export your data by contacting us.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Cookies</h3>
          <p className="mt-2 leading-relaxed">
            We use cookies only to keep you signed in. No tracking cookies, no analytics cookies.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Children</h3>
          <p className="mt-2 leading-relaxed">
            Things I Like is not intended for anyone under 13 and does not permit adult or sexually explicit content of
            any kind. If you encounter such content please report it immediately.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Contact</h3>
          <p className="mt-2 leading-relaxed">
            Questions? Email us at{' '}
            <a href="mailto:hello@thingsilike.app" className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950">
              hello@thingsilike.app
            </a>
          </p>
        </section>

        <section aria-labelledby="terms-heading">
          <h2 id="terms-heading" className="text-base font-semibold text-zinc-900">
            Terms of Service
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Things I Like · Last updated March 2026</p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">The short version</h3>
          <p className="mt-2 leading-relaxed">
            Be a good person. Post things you actually like. Don&apos;t post things that would hurt people. We can remove
            content or accounts that violate these terms.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your account</h3>
          <p className="mt-2 leading-relaxed">
            You&apos;re responsible for keeping your account secure. You must be at least 13 years old to use Things I
            Like.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your content</h3>
          <p className="mt-2 leading-relaxed">
            You own what you post. By posting it you give us a license to display it on the platform and to people who
            follow you. We don&apos;t claim ownership of your content and we don&apos;t use it for anything beyond running
            the service.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">What you can post</h3>
          <p className="mt-2 leading-relaxed">
            Things you genuinely like — music, books, articles, photos, quotes, videos, thoughts. Content should be yours
            to share or properly attributed.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">What you can&apos;t post</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
            <li>Content that is illegal</li>
            <li>Content that sexualizes minors — zero tolerance, reported to authorities</li>
            <li>Pornographic or sexually explicit content of any kind</li>
            <li>Harassment, threats, or targeted abuse of other users</li>
            <li>Spam or automated posts</li>
            <li>Content that infringes someone else&apos;s copyright or trademark</li>
            <li>Impersonation of other people or brands</li>
          </ul>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Embedded content</h3>
          <p className="mt-2 leading-relaxed">
            When you share a link to Spotify, YouTube, or another service, their content appears on your post. You&apos;re
            responsible for ensuring you have the right to share that content. We display it via their standard embed APIs.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Our rights</h3>
          <p className="mt-2 leading-relaxed">
            We can remove any content that violates these terms. We can suspend or terminate accounts that repeatedly
            violate these terms or that we determine are harmful to the community. We&apos;ll try to give you notice when
            we do this unless there&apos;s a legal or safety reason not to.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">The service</h3>
          <p className="mt-2 leading-relaxed">
            We provide Things I Like as-is. We try hard to keep it running but we don&apos;t guarantee uptime or that
            it&apos;ll work perfectly. We&apos;re not liable for losses resulting from using or being unable to use the
            service.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Changes</h3>
          <p className="mt-2 leading-relaxed">
            We may update these terms. If we make significant changes we&apos;ll notify you by email or by a prominent
            notice on the service. Continued use after changes means you accept the new terms.
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Governing law</h3>
          <p className="mt-2 leading-relaxed">These terms are governed by the laws of the State of New York.</p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Contact</h3>
          <p className="mt-2 leading-relaxed">
            Questions? Email us at{' '}
            <a href="mailto:hello@thingsilike.app" className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950">
              hello@thingsilike.app
            </a>
          </p>
        </section>
      </div>
    </footer>
  )
}
