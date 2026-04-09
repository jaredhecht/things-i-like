'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/src/components/AuthProvider'
import { ElsewhereSettingsSection } from '@/src/components/ElsewhereSettingsSection'
import { ModulesSettingsSection } from '@/src/components/ModulesSettingsSection'
import { oauthSignInRedirectOptions } from '@/src/lib/oauth-redirect'
import { supabase } from '@/src/lib/supabase'

const POST_IMAGES_BUCKET = 'post-images'
const BIO_MAX = 160
/** After resize, uploads must be under this (matches post image cap). */
const AVATAR_MAX_BYTES = 8 * 1024 * 1024
const AVATAR_MAX_DIMENSION = 1200

function extFromFile(f: File): string {
  if (f.type === 'image/jpeg' || f.type === 'image/jpg') return 'jpg'
  if (f.type === 'image/png') return 'png'
  if (f.type === 'image/webp') return 'webp'
  if (f.type === 'image/gif') return 'gif'
  const p = f.name.split('.').pop()
  const cleaned = p?.replace(/[^a-z0-9]/gi, '').slice(0, 8)
  return cleaned || 'jpg'
}

/** Shrink large photos (e.g. phone camera) in the browser so upload stays under maxBytes. */
async function shrinkImageFileForAvatar(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file
  if (!file.type.startsWith('image/')) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(
      'This image could not be opened in the browser. Try picking a JPEG/PNG, or use your phone’s editor to export a smaller copy.',
    )
  }

  const origW = bitmap.width
  const origH = bitmap.height
  let maxDim = AVATAR_MAX_DIMENSION
  let quality = 0.88

  try {
    for (let i = 0; i < 12; i++) {
      const scale = Math.min(1, maxDim / Math.max(origW, origH))
      const w = Math.max(1, Math.round(origW * scale))
      const h = Math.max(1, Math.round(origH * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) break
      ctx.drawImage(bitmap, 0, 0, w, h)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      })
      if (!blob) break
      if (blob.size <= maxBytes) {
        return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() })
      }
      quality -= 0.07
      maxDim = Math.round(maxDim * 0.82)
      if (quality < 0.35) break
    }
    throw new Error('Photo is still too large after resizing. Try another image or crop it in your Photos app first.')
  } finally {
    bitmap.close()
  }
}

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  elsewhere_visible?: boolean | null
  weekly_digest_enabled?: boolean | null
}

export default function SettingsPage() {
  const router = useRouter()
  const { authResolved, user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [bioSaving, setBioSaving] = useState(false)
  const [weeklyDigestSaving, setWeeklyDigestSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (userId: string | null) => {
    setLoading(true)
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, elsewhere_visible')
      .eq('id', userId)
      .maybeSingle()
    const nextProfile = data as Profile | null
    if (nextProfile) {
      const prefRes = await supabase
        .from('profiles')
        .select('weekly_digest_enabled')
        .eq('id', userId)
        .maybeSingle()
      if (!prefRes.error) {
        nextProfile.weekly_digest_enabled =
          (prefRes.data as { weekly_digest_enabled?: boolean | null } | null)?.weekly_digest_enabled ?? true
      } else {
        console.warn('weekly_digest_enabled unavailable:', prefRes.error.message)
        nextProfile.weekly_digest_enabled = null
      }
    }
    setProfile(nextProfile)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authResolved) return
    void load(user?.id ?? null)
  }, [authResolved, load, user?.id])

  useEffect(() => {
    setBioDraft(profile?.bio ?? '')
  }, [profile])

  async function saveBio() {
    if (!user?.id) return
    const trimmed = bioDraft.trim().slice(0, BIO_MAX)
    setBioSaving(true)
    const { error } = await supabase.from('profiles').update({ bio: trimmed || null }).eq('id', user.id)
    if (error) {
      alert(`Could not save bio: ${error.message}`)
      setBioSaving(false)
      return
    }
    await load(user.id)
    setBioSaving(false)
  }

  async function saveWeeklyDigestEnabled(nextValue: boolean) {
    if (!user?.id) return
    setWeeklyDigestSaving(true)
    const { error } = await supabase.from('profiles').update({ weekly_digest_enabled: nextValue }).eq('id', user.id)
    if (error) {
      alert(`Could not update weekly email preference: ${error.message}`)
      setWeeklyDigestSaving(false)
      return
    }
    setProfile((prev) => (prev ? { ...prev, weekly_digest_enabled: nextValue } : prev))
    setWeeklyDigestSaving(false)
  }

  async function uploadAvatar(file: File) {
    if (!user?.id) return
    if (!file.type.startsWith('image/')) {
      alert('Choose an image file.')
      return
    }
    let toUpload: File
    try {
      toUpload = await shrinkImageFileForAvatar(file, AVATAR_MAX_BYTES)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not process this image.')
      return
    }
    if (toUpload.size > AVATAR_MAX_BYTES) {
      alert(`Image must end up at ${AVATAR_MAX_BYTES / (1024 * 1024)} MB or smaller after processing.`)
      return
    }
    setUploading(true)
    const ext = extFromFile(toUpload)
    const path = `${user.id}/avatar/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, toUpload, {
      cacheControl: '3600',
      upsert: false,
      contentType: toUpload.type || 'image/jpeg',
    })
    if (upErr) {
      alert(
        `Upload failed: ${upErr.message}\n\nUse the same Storage setup as post images (supabase/storage-post-images.sql).`,
      )
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path)
    const publicUrl = data.publicUrl
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    if (dbErr) {
      alert(`Saved file but profile update failed: ${dbErr.message}`)
      setUploading(false)
      return
    }
    await load(user.id)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function deleteAccount() {
    if (!user) return
    setDeleteBusy(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        alert('Not signed in.')
        return
      }
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
      if (!res.ok) {
        const base = body.error || 'Could not delete account.'
        const dev = process.env.NODE_ENV === 'development'
        let hint = ''
        if (dev) {
          if (body.code === 'missing_service_role' || /SUPABASE_SERVICE_ROLE_KEY|not configured/i.test(base)) {
            hint =
              '\n\nAdd SUPABASE_SERVICE_ROLE_KEY to .env.local (see .env.example) or your host env; redeploy. Key: Supabase → Project Settings → API (service_role).'
          } else if (body.code === 'fk_blocked' || /Database error deleting user/i.test(base)) {
            hint =
              '\n\nRun supabase/account-delete-fk-cascade.sql in the Supabase SQL Editor (FKs to auth.users need ON DELETE CASCADE).'
          }
        } else if (body.code === 'missing_service_role' || /not configured/i.test(base)) {
          hint = '\n\nThis action is temporarily unavailable. Please try again later.'
        } else if (body.code === 'fk_blocked' || /Database error deleting user/i.test(base)) {
          hint = '\n\nPlease try again or contact support if this continues.'
        }
        alert(`${base}${hint}`)
        return
      }
      await supabase.auth.signOut()
      router.push('/')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not delete account.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const preview =
    (profile?.avatar_url as string | undefined) || (user?.user_metadata?.avatar_url as string | undefined)

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-lg px-4 py-10">
          <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-lg px-4 py-10">
          <p className="mb-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
              ← Things I Like
            </Link>
          </p>
          <h1 className="text-2xl font-light text-zinc-900">Settings</h1>
          <p className="mt-4 text-sm text-zinc-500">Sign in to manage your account.</p>
          <button
            type="button"
            onClick={() =>
              void supabase.auth.signInWithOAuth({
                provider: 'google',
                options: oauthSignInRedirectOptions('/settings'),
              })
            }
            className="mt-4 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Sign in with Google
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fafafa]">
      {deleteOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => !deleteBusy && setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-acct-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-acct-title" className="text-lg font-medium text-zinc-900">
              Delete your account?
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              This permanently removes your account, profile, and posts. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void deleteAccount()}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <h1 className="mb-8 text-2xl font-light tracking-tight text-zinc-900">Settings</h1>

        <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Profile photo</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Shown on your profile, posts, and Who&apos;s Here. Large phone photos are resized automatically (max{' '}
            {AVATAR_MAX_BYTES / (1024 * 1024)}&nbsp;MB).
          </p>
          <div className="mt-4 flex items-center gap-4">
            {preview ? (
              <img src={preview} alt="" className="h-16 w-16 rounded-full border border-zinc-200 object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-lg text-zinc-400">
                ?
              </div>
            )}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadAvatar(f)
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Change photo'}
              </button>
            </div>
          </div>
        </section>

        <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Bio</h2>
          <p className="mt-1 text-sm text-zinc-500">
            A short line about you. Shown on your public profile under your username (max {BIO_MAX} characters).
          </p>
          <textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="Optional"
            className="mt-3 w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-400">
              {bioDraft.length}/{BIO_MAX}
            </span>
            <button
              type="button"
              disabled={bioSaving}
              onClick={() => void saveBio()}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {bioSaving ? 'Saving…' : 'Save bio'}
            </button>
          </div>
        </section>

        {profile ? <ModulesSettingsSection userId={user.id} /> : null}

        {profile ? (
          <ElsewhereSettingsSection
            userId={user.id}
            elsewhereVisible={profile.elsewhere_visible === true}
            onElsewhereVisibleChange={(v) =>
              setProfile((p) => (p ? { ...p, elsewhere_visible: v } : p))
            }
            onRefreshProfile={() => load(user.id)}
          />
        ) : null}

        <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Weekly email</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Get a weekly recap of new followers, likes, and activity from people you follow.
          </p>
          {profile?.weekly_digest_enabled === null ? (
            <p className="mt-4 text-sm text-zinc-500">
              Weekly email preferences are not set up yet. Run `supabase/weekly-digest-email.sql` in Supabase to
              enable this setting.
            </p>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">Happening Things weekly update</p>
                <p className="text-sm text-zinc-500">
                  {profile?.weekly_digest_enabled ? 'You will receive the weekly email.' : 'You are unsubscribed from the weekly email.'}
                </p>
              </div>
              <button
                type="button"
                disabled={weeklyDigestSaving}
                onClick={() => void saveWeeklyDigestEnabled(!(profile?.weekly_digest_enabled === true))}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {weeklyDigestSaving ? 'Saving…' : profile?.weekly_digest_enabled ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
          <p className="mt-1 text-sm text-zinc-500">Remove your account and all content.</p>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete account
          </button>
        </section>

        {profile ? (
          <p className="mt-6 text-center text-xs text-zinc-400">
            @{profile.username} ·{' '}
            <Link href={`/${profile.username}`} className="text-zinc-500 hover:underline">
              View your blog
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  )
}
