'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../src/components/AuthProvider'
import { ComposerTypeIcon } from '../src/components/ComposerTypeIcons'
import { PostCard } from '../src/components/PostCard'
import { HomeLegalFooter } from '../src/components/HomeLegalFooter'
import { HomeFeedSkeleton } from '../src/components/HomePageSkeleton'
import { UserNavMenu } from '../src/components/UserNavMenu'
import {
  getSoundCloudWidgetSrc,
  getSpotifyEmbedUrl,
  getYouTubeVideoId,
  getHostnameLabel,
  isSoundCloudUrl,
  isValidHttpUrl,
  linkPreviewHasVisual,
  normalizeLinkUrl,
  soleGenericArticleUrlFromTextPost,
  soleSoundCloudUrlFromTextPost,
  soleYoutubeUrlFromTextPost,
  stripHtml,
  type LinkPreview,
  type Post,
} from '../src/lib/post-helpers'
import { fetchRecentPostsForAuthorIds, fetchRecentPostsGlobal } from '../src/lib/posts-batched'
import { fetchEngagementForPostIds } from '../src/lib/engagement-client'
import type { ProfileModuleRow } from '../src/lib/modules-ui'
import { sanitizeRichHtml } from '../src/lib/sanitize-rich-html'
import { oauthSignInRedirectOptions } from '../src/lib/oauth-redirect'
import { tagsFromComposerInputs, parsePostTags } from '../src/lib/post-tags'
import { buildRethingSnapshotForInsert } from '../src/lib/rething-chain'
import { fetchRethingCountsForPostIds } from '../src/lib/rething-counts'
import {
  authorMetaForRethingFromUsername,
  mergeProfilesForRethingUsernames,
} from '../src/lib/merge-rething-author-profiles'
import { supabase } from '../src/lib/supabase'
import type { PlaceDetailsPayload, PlacePrediction } from '../src/lib/places-client'

const RichTextEditor = dynamic(
  () => import('../src/components/RichTextEditor').then((mod) => mod.RichTextEditor),
)
const ComposerModuleChips = dynamic(
  () => import('../src/components/ComposerModuleChips').then((mod) => mod.ComposerModuleChips),
)
const PeopleWhoLikeThingsDirectory = dynamic(
  () => import('../src/components/PeopleWhoLikeThingsDirectory').then((mod) => mod.PeopleWhoLikeThingsDirectory),
)
const InlinePostEditor = dynamic(
  () => import('../src/components/InlinePostEditor').then((mod) => mod.InlinePostEditor),
)
const PostModulesSheet = dynamic(
  () => import('../src/components/PostModulesSheet').then((mod) => mod.PostModulesSheet),
)

async function fetchLinkPreviewClientLazy(url: string) {
  const { fetchLinkPreviewClient } = await import('../src/lib/link-preview-client')
  return fetchLinkPreviewClient(url)
}

async function fetchPlaceAutocompleteLazy(input: string) {
  const { fetchPlaceAutocomplete } = await import('../src/lib/places-client')
  return fetchPlaceAutocomplete(input)
}

async function fetchPlaceDetailsLazy(placeId: string) {
  const { fetchPlaceDetails } = await import('../src/lib/places-client')
  return fetchPlaceDetails(placeId)
}

async function cacheGooglePlacePhotoLazy(photoReference: string) {
  const { cacheGooglePlacePhoto } = await import('../src/lib/places-client')
  return cacheGooglePlacePhoto(photoReference)
}

async function classifyPostAfterSaveLazy(postId: string) {
  const { classifyPostAfterSave } = await import('../src/lib/modules-ui')
  return classifyPostAfterSave(postId)
}

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url?: string | null
  modules_ai_enabled?: boolean | null
}

type AuthorMeta = {
  username: string
  display_name: string | null
  avatar_url?: string | null
}

type ComposerType = 'image' | 'video' | 'link' | 'place' | 'text' | 'quote' | 'audio'
type LinkTab = 'article' | 'spotify' | 'youtube'
type EditorTarget = 'text' | 'caption'

const POST_IMAGES_BUCKET = 'post-images'
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
/** Signed-out home: at most one recent post per author, up to this many distinct authors. */
const PUBLIC_PREVIEW_MAX_POSTS = 10
const PUBLIC_PREVIEW_PAGE = 150
/** Cap sequential post fetches for signed-out preview (each round trip is slow on mobile / cold start). */
const PUBLIC_PREVIEW_MAX_PAGES = 10
const PROFILE_IN_CHUNK = 100
/** Signed-in dashboard: page size for following + everything feeds (infinite scroll loads more). */
const FEED_PAGE_SIZE = 20
const HOME_FEED_SCOPE_KEY = 'til-home-feed-scope'
type HomeFeedScope = 'following' | 'everything'
type FeedFetchOptions = { offset?: number; append?: boolean }

export default function Home() {
  const router = useRouter()
  const { authResolved, user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [username, setUsername] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [panel, setPanel] = useState<ComposerType | null>(null)
  const [linkTab, setLinkTab] = useState<LinkTab>('article')
  const [textContent, setTextContent] = useState('')
  const [quoteContent, setQuoteContent] = useState('')
  const [quoteAuthor, setQuoteAuthor] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageLocalPreview, setImageLocalPreview] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageDropActive, setImageDropActive] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [spotifyUrl, setSpotifyUrl] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [articleUrl, setArticleUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [placeSearchInput, setPlaceSearchInput] = useState('')
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([])
  const [placeDetails, setPlaceDetails] = useState<PlaceDetailsPayload | null>(null)
  const [placeFreeformName, setPlaceFreeformName] = useState('')
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false)
  const [placeGooglePhotoLoading, setPlaceGooglePhotoLoading] = useState(false)
  const [caption, setCaption] = useState('')
  const [tagInput0, setTagInput0] = useState('')
  const [tagInput1, setTagInput1] = useState('')
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null)
  const [textOnlyLinkPreview, setTextOnlyLinkPreview] = useState<LinkPreview | null>(null)
  const [textComposerPreviewLoading, setTextComposerPreviewLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeEditor, setActiveEditor] = useState<EditorTarget | null>(null)
  const [formatState, setFormatState] = useState({ bold: false, italic: false })
  const [loading, setLoading] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null)
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<Post | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [authorByUserId, setAuthorByUserId] = useState<Record<string, AuthorMeta>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Set<string>>(() => new Set())
  const [rethingCounts, setRethingCounts] = useState<Record<string, number>>({})
  const [rethingSource, setRethingSource] = useState<Post | null>(null)
  const [rethingCaption, setRethingCaption] = useState('')
  const [rethingBusy, setRethingBusy] = useState(false)
  const [notifUnread, setNotifUnread] = useState(false)
  const [profileModulesForComposer, setProfileModulesForComposer] = useState<ProfileModuleRow[]>([])
  const [composerModuleIds, setComposerModuleIds] = useState<Set<string>>(() => new Set())
  const [modulesSheetPost, setModulesSheetPost] = useState<Post | null>(null)
  const textEditorRef = useRef<HTMLDivElement | null>(null)
  const captionEditorRef = useRef<HTMLDivElement | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const placeComboRef = useRef<HTMLDivElement | null>(null)
  /** After picking a prediction, skip autocomplete until the user edits the field (otherwise the debounced effect reopens the list). */
  const placeAutocompleteLockedRef = useRef(false)
  const isOnboardingFeedRef = useRef(false)
  /** Latest signed-in user for callbacks that must not call `getUser()` (avoids auth lock races on startup). */
  const userRef = useRef<User | null>(null)
  userRef.current = user
  const [feedScope, setFeedScope] = useState<HomeFeedScope>('following')
  const feedScopeRef = useRef<HomeFeedScope>('following')
  feedScopeRef.current = feedScope
  const [followingOtherCount, setFollowingOtherCount] = useState<number | null>(null)
  /** Others this user follows (for inline Follow on posts from non-followed authors in Following / EveryThing). */
  const [followingUserIds, setFollowingUserIds] = useState<Set<string>>(() => new Set())
  const [feedBootstrapped, setFeedBootstrapped] = useState(false)
  const [feedLoadingInitial, setFeedLoadingInitial] = useState(false)
  const [feedHasMore, setFeedHasMore] = useState(false)
  const [feedLoadingMore, setFeedLoadingMore] = useState(false)
  const [publicPreviewLoading, setPublicPreviewLoading] = useState(false)
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0)
  /** Following tab “pick people” panel: stays open until dismissed, even after the first follow. */
  const [pickPeopleVisible, setPickPeopleVisible] = useState(false)
  const postsRef = useRef<Post[]>([])
  postsRef.current = posts
  const feedSentinelRef = useRef<HTMLDivElement | null>(null)
  const feedTabsRef = useRef<HTMLDivElement | null>(null)

  const scrollToFeedTabs = useCallback(() => {
    if (typeof window === 'undefined') return
    requestAnimationFrame(() => {
      feedTabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  function clearImageComposerState() {
    setImageLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageUrl('')
    setImageUploading(false)
  }

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!user?.id) {
        alert('Sign in to upload images.')
        return
      }
      if (!file.type.startsWith('image/')) {
        alert('Please choose an image file (JPG, PNG, GIF, or WebP).')
        return
      }
      if (file.size > IMAGE_MAX_BYTES) {
        alert('Image must be 8 MB or smaller.')
        return
      }
      setImageUrl('')
      setImageLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      setImageUploading(true)
      const rawExt = file.name.split('.').pop() || 'jpg'
      const ext = rawExt.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg'
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
      const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      })
      setImageUploading(false)
      setImageLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      if (error) {
        alert(
          `Could not upload image: ${error.message}\n\nIf storage is not set up yet, run the script supabase/storage-post-images.sql once in Supabase → SQL Editor.`,
        )
        setImageUrl('')
        return
      }
      const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path)
      setImageUrl(data.publicUrl)
    },
    [user?.id],
  )

  async function syncAvatarToProfile(u: User) {
    const avatarUrl = u.user_metadata?.avatar_url
    if (!u.id || typeof avatarUrl !== 'string' || !avatarUrl.trim()) return
    await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', u.id)
  }

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    try {
      const [{ data }, { data: mods }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase
          .from('profile_modules')
          .select('id, name, sort_order, is_active')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('sort_order'),
      ])
      if (data) {
        setProfile(data)
        setNeedsUsername(false)
      } else {
        setProfile(null)
        setNeedsUsername(true)
      }
      setProfileModulesForComposer((mods || []) as ProfileModuleRow[])
    } finally {
      setProfileLoading(false)
    }
  }, [])

  async function claimUsername(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !username.trim()) return
    setLoading(true)
    const avatarFromOAuth = user.user_metadata?.avatar_url
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      username: username.trim().toLowerCase(),
      display_name: user.user_metadata?.full_name || username.trim(),
      avatar_url: typeof avatarFromOAuth === 'string' ? avatarFromOAuth : null,
    })
    if (error) alert(error.code === '23505' ? 'That username is already taken. Try another one.' : `Error claiming username: ${error.message}`)
    else await loadProfile(user.id)
    setLoading(false)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: oauthSignInRedirectOptions('/'),
    })
  }

  async function signOut() {
    if (typeof window !== 'undefined') localStorage.removeItem('til_home_feed_gate')
    await supabase.auth.signOut()
    setProfile(null)
    setProfileModulesForComposer([])
    setComposerModuleIds(new Set())
  }

  const hydrateEngagement = useCallback(async (userId: string, list: Post[]) => {
    if (list.length === 0) {
      setLikeCounts({})
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      setRethingCounts({})
      return
    }
    const ids = list.map((p) => p.id)
    const [{ likeCounts: countByPost, likedPostIds: my, bookmarkedPostIds: bookmarks }, rethingByPost] =
      await Promise.all([
        fetchEngagementForPostIds(supabase, userId, ids),
        fetchRethingCountsForPostIds(supabase, ids),
      ])
    setLikeCounts(countByPost)
    setLikedPostIds(my)
    setBookmarkedPostIds(bookmarks)
    setRethingCounts(rethingByPost)
  }, [])

  const mergeEngagementForNewPosts = useCallback(async (userId: string, list: Post[]) => {
    if (list.length === 0) return
    const ids = list.map((p) => p.id)
    const [{ likeCounts, likedPostIds: my, bookmarkedPostIds: bookmarks }, rethingByPost] = await Promise.all([
      fetchEngagementForPostIds(supabase, userId, ids),
      fetchRethingCountsForPostIds(supabase, ids),
    ])
    setLikeCounts((prev) => ({ ...prev, ...likeCounts }))
    setLikedPostIds((prev) => new Set([...prev, ...my]))
    setBookmarkedPostIds((prev) => new Set([...prev, ...bookmarks]))
    setRethingCounts((prev) => ({ ...prev, ...rethingByPost }))
  }, [])

  const mergeRethingAuthorsIntoState = useCallback(async (list: Post[], baseMap: Record<string, AuthorMeta>) => {
    if (list.length === 0) return
    const mergedMap = { ...baseMap }
    await mergeProfilesForRethingUsernames(supabase, list, mergedMap)
    setAuthorByUserId((prev) => ({ ...prev, ...mergedMap }))
  }, [])

  const loadPublicPreviewPosts = useCallback(async () => {
    setPublicPreviewLoading(true)
    try {
      const picked: Post[] = []
      const seenUser = new Set<string>()
      let offset = 0

      for (let page = 0; page < PUBLIC_PREVIEW_MAX_PAGES && picked.length < PUBLIC_PREVIEW_MAX_POSTS; page++) {
        const { data: rows, error } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + PUBLIC_PREVIEW_PAGE - 1)
        if (error) {
          console.error('Error loading public preview posts:', error)
          setPosts([])
          setAuthorByUserId({})
          setLikeCounts({})
          return
        }
        const batch = (rows || []) as Post[]
        if (batch.length === 0) break
        for (const p of batch) {
          const uid = p.user_id
          if (!uid || seenUser.has(uid)) continue
          seenUser.add(uid)
          picked.push(p)
          if (picked.length >= PUBLIC_PREVIEW_MAX_POSTS) break
        }
        if (batch.length < PUBLIC_PREVIEW_PAGE) break
        offset += PUBLIC_PREVIEW_PAGE
      }

      const ids = [...seenUser]
      if (ids.length === 0) {
        setPosts([])
        setAuthorByUserId({})
        setLikeCounts({})
        return
      }
      const map: Record<string, AuthorMeta> = {}
      for (let i = 0; i < ids.length; i += PROFILE_IN_CHUNK) {
        const slice = ids.slice(i, i + PROFILE_IN_CHUNK)
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', slice)
        if (profErr) {
          console.error('Error loading preview author profiles:', profErr)
          continue
        }
        for (const p of profs || []) {
          const raw = p.avatar_url
          const avatarUrl = typeof raw === 'string' ? raw.trim() || null : raw ?? null
          map[p.id] = {
            username: p.username,
            display_name: p.display_name,
            avatar_url: avatarUrl,
          }
        }
      }
      await mergeProfilesForRethingUsernames(supabase, picked, map)
      const previewLikeCounts: Record<string, number> = {}
      for (const post of picked) previewLikeCounts[post.id] = 0
      if (picked.length > 0) {
        const postIds = picked.map((post) => post.id)
        const chunkSize = 120
        for (let i = 0; i < postIds.length; i += chunkSize) {
          const slice = postIds.slice(i, i + chunkSize)
          const { data: countRows, error: countErr } = await supabase.rpc('post_like_counts', { post_ids: slice })
          if (countErr) {
            console.warn('[home] public preview post_like_counts RPC failed:', countErr.message)
            break
          }
          for (const row of countRows || []) {
            const r = row as Record<string, unknown>
            const pid = typeof r.post_id === 'string' ? r.post_id : String(r.post_id ?? '')
            const lc = r.like_count
            const n = typeof lc === 'number' ? lc : typeof lc === 'string' ? parseInt(lc, 10) : Number(lc)
            if (pid) previewLikeCounts[pid] = Number.isFinite(n) ? n : 0
          }
        }
      }
      setPosts(picked)
      setAuthorByUserId(map)
      setLikeCounts(previewLikeCounts)
    } finally {
      setPublicPreviewLoading(false)
    }
  }, [])

  const fetchFeedForUser = useCallback(
    async (userId: string, preloadedFollowingIds?: string[], options?: FeedFetchOptions) => {
      const offset = options?.offset ?? 0
      const append = options?.append ?? false
      if (!append) setFeedLoadingInitial(true)
      try {
        let followingIds: string[]
        if (preloadedFollowingIds) {
          followingIds = preloadedFollowingIds
        } else {
          const { data: follows, error: followErr } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
          if (followErr) console.error('Error fetching follows:', followErr)
          followingIds = [...new Set((follows || []).map((f) => f.following_id))]
        }
        const authorIds = [...new Set([userId, ...followingIds])]
        const list = await fetchRecentPostsForAuthorIds(supabase, authorIds, FEED_PAGE_SIZE, offset).catch((error) => {
          console.error('Error fetching feed:', error)
          return [] as Post[]
        })
        const profileQueryIds = [...new Set(list.map((p) => p.user_id).filter((id): id is string => Boolean(id)))]
        const map: Record<string, AuthorMeta> = {}
        if (profileQueryIds.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', profileQueryIds)
          if (profErr) console.error('Error loading feed author profiles:', profErr)
          for (const p of profs || []) {
            map[p.id] = {
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url ?? null,
            }
          }
        }
        void mergeRethingAuthorsIntoState(list, map)
        const hasMore = list.length === FEED_PAGE_SIZE
        if (append) {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id))
            const out = [...prev]
            for (const p of list) {
              if (!seen.has(p.id)) {
                seen.add(p.id)
                out.push(p)
              }
            }
            return out
          })
          setAuthorByUserId((prev) => ({ ...prev, ...map }))
          await mergeEngagementForNewPosts(userId, list)
        } else {
          setAuthorByUserId(map)
          setPosts(list)
          await hydrateEngagement(userId, list)
        }
        setFeedHasMore(hasMore)
      } finally {
        if (!append) setFeedLoadingInitial(false)
      }
    },
    [hydrateEngagement, mergeEngagementForNewPosts, mergeRethingAuthorsIntoState],
  )

  const fetchEverythingFeed = useCallback(
    async (userId: string, options?: FeedFetchOptions) => {
      const offset = options?.offset ?? 0
      const append = options?.append ?? false
      if (!append) setFeedLoadingInitial(true)
      try {
        const list = await fetchRecentPostsGlobal(supabase, FEED_PAGE_SIZE, offset).catch((error) => {
          console.error('Error fetching global feed:', error)
          return [] as Post[]
        })
        const authorIds = [...new Set(list.map((p) => p.user_id).filter((id): id is string => Boolean(id)))]
        const map: Record<string, AuthorMeta> = {}
        for (let i = 0; i < authorIds.length; i += PROFILE_IN_CHUNK) {
          const slice = authorIds.slice(i, i + PROFILE_IN_CHUNK)
          const { data: profs, error: profErr } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', slice)
          if (profErr) {
            console.error('Error loading global feed author profiles:', profErr)
            continue
          }
          for (const p of profs || []) {
            map[p.id] = {
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url ?? null,
            }
          }
        }
        void mergeRethingAuthorsIntoState(list, map)
        const hasMore = list.length === FEED_PAGE_SIZE
        if (append) {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id))
            const out = [...prev]
            for (const p of list) {
              if (!seen.has(p.id)) {
                seen.add(p.id)
                out.push(p)
              }
            }
            return out
          })
          setAuthorByUserId((prev) => ({ ...prev, ...map }))
          await mergeEngagementForNewPosts(userId, list)
        } else {
          setAuthorByUserId(map)
          setPosts(list)
          await hydrateEngagement(userId, list)
        }
        setFeedHasMore(hasMore)
      } finally {
        if (!append) setFeedLoadingInitial(false)
      }
    },
    [hydrateEngagement, mergeEngagementForNewPosts, mergeRethingAuthorsIntoState],
  )

  const runHomeBootstrap = useCallback(async (userId: string) => {
    const { data: follows, error: followErr } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    if (followErr) console.error('Error fetching follows (bootstrap):', followErr)
    const rows = follows || []
    const followingIds = [...new Set(rows.map((f) => f.following_id as string).filter((id): id is string => Boolean(id)))]
    setFollowingOtherCount(followingIds.length)
    setFollowingUserIds(new Set(followingIds))
    return followingIds
  }, [])

  const loadPublicPreviewPostsRef = useRef(loadPublicPreviewPosts)
  loadPublicPreviewPostsRef.current = loadPublicPreviewPosts
  const runHomeBootstrapRef = useRef(runHomeBootstrap)
  runHomeBootstrapRef.current = runHomeBootstrap
  const bootstrapFollowingIdsRef = useRef<string[] | null>(null)
  /** Last user id we started home bootstrap for; avoids setFeedBootstrapped(false) on spurious effect re-runs. */
  const lastHomeBootstrapUidRef = useRef<string | null>(null)

  const refetchFollowingCount = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    if (error) {
      console.error('refetchFollowingCount:', error)
      return
    }
    const rows = data || []
    const followingIds = rows
      .map((f) => f.following_id as string)
      .filter((id): id is string => Boolean(id))
    bootstrapFollowingIdsRef.current = followingIds
    setFollowingOtherCount(rows.length)
    setFollowingUserIds(new Set(followingIds))
  }, [user?.id])

  const switchFeedToFollowing = useCallback(() => {
    setFeedScope('following')
    try {
      localStorage.setItem(HOME_FEED_SCOPE_KEY, 'following')
    } catch {
      /* ignore */
    }
    setPickPeopleVisible(followingOtherCount === 0)
  }, [followingOtherCount])

  const switchFeedToEverything = useCallback(() => {
    setFeedScope('everything')
    try {
      localStorage.setItem(HOME_FEED_SCOPE_KEY, 'everything')
    } catch {
      /* ignore */
    }
    setPickPeopleVisible(false)
  }, [])

  const handleRecommendationsContinue = useCallback(() => {
    if ((followingOtherCount ?? 0) > 0) {
      switchFeedToFollowing()
      scrollToFeedTabs()
      return
    }
    switchFeedToEverything()
    scrollToFeedTabs()
  }, [followingOtherCount, scrollToFeedTabs, switchFeedToEverything, switchFeedToFollowing])

  async function fetchFeed() {
    const u = userRef.current
    if (!u?.id) return
    if (isOnboardingFeedRef.current) {
      setDirectoryRefreshKey((k) => k + 1)
      return
    }
    if (feedScopeRef.current === 'everything') {
      await fetchEverythingFeed(u.id)
    } else {
      await fetchFeedForUser(u.id)
    }
  }

  const loadMoreFeed = useCallback(async () => {
    const u = userRef.current
    if (!u?.id || feedLoadingMore || !feedHasMore) return
    if (isOnboardingFeedRef.current) return
    if (postsRef.current.length === 0) return
    setFeedLoadingMore(true)
    try {
      const offset = postsRef.current.length
      if (feedScopeRef.current === 'everything') {
        await fetchEverythingFeed(u.id, { offset, append: true })
      } else {
        await fetchFeedForUser(u.id, undefined, { offset, append: true })
      }
    } finally {
      setFeedLoadingMore(false)
    }
  }, [feedLoadingMore, feedHasMore, fetchEverythingFeed, fetchFeedForUser])

  const loadMoreFeedRef = useRef(loadMoreFeed)
  loadMoreFeedRef.current = loadMoreFeed

  async function toggleBookmark(postId: string) {
    if (!user?.id) return
    const marked = bookmarkedPostIds.has(postId)
    if (marked) {
      const { error } = await supabase.from('post_bookmarks').delete().eq('user_id', user.id).eq('post_id', postId)
      if (error) {
        alert(error.message)
        return
      }
      setBookmarkedPostIds((prev) => {
        const n = new Set(prev)
        n.delete(postId)
        return n
      })
    } else {
      const { error } = await supabase.from('post_bookmarks').insert({ user_id: user.id, post_id: postId })
      if (error) {
        alert(error.message)
        return
      }
      setBookmarkedPostIds((prev) => new Set(prev).add(postId))
    }
  }

  async function toggleLike(postId: string) {
    if (!user?.id) return
    const liked = likedPostIds.has(postId)
    if (liked) {
      const { error } = await supabase.from('post_likes').delete().eq('user_id', user.id).eq('post_id', postId)
      if (error) {
        alert(error.message)
        return
      }
      setLikedPostIds((prev) => {
        const n = new Set(prev)
        n.delete(postId)
        return n
      })
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }))
    } else {
      const { error } = await supabase.from('post_likes').insert({ user_id: user.id, post_id: postId })
      if (error) {
        alert(error.message)
        return
      }
      setLikedPostIds((prev) => new Set(prev).add(postId))
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }))
    }
  }

  async function confirmRething() {
    if (!user || !rethingSource) return
    setRethingBusy(true)
    const origAuthor =
      (rethingSource.rething_from_username && rethingSource.rething_from_username.trim()) ||
      (rethingSource.user_id ? authorByUserId[rethingSource.user_id]?.username : '') ||
      'someone'
    const baseMeta =
      rethingSource.metadata && typeof rethingSource.metadata === 'object'
        ? { ...(rethingSource.metadata as Record<string, unknown>) }
        : {}
    const rethingTags = parsePostTags(rethingSource.tags)
    const metadata = {
      ...baseMeta,
      rething_original: buildRethingSnapshotForInsert(rethingSource),
    }
    const { data: rethingRow, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        type: rethingSource.type,
        content: rethingSource.content,
        caption: stripHtml(rethingCaption).length ? sanitizeRichHtml(rethingCaption.trim()) : null,
        metadata,
        rething_of_post_id: rethingSource.id,
        rething_from_username: origAuthor,
        tags: rethingTags.length ? rethingTags : [],
      })
      .select('id')
      .single()
    if (error) alert(`Could not rething: ${error.message}`)
    else {
      if (rethingRow?.id) void classifyPostAfterSaveLazy(rethingRow.id as string)
      setRethingSource(null)
      setRethingCaption('')
      await fetchFeed()
    }
    setRethingBusy(false)
  }

  useEffect(() => {
    if (!authResolved) return
    if (!user?.id) {
      setProfile(null)
      setNeedsUsername(false)
      setProfileModulesForComposer([])
      return
    }
    void loadProfile(user.id)
  }, [authResolved, loadProfile, user?.id])

  // Only `user?.id` in deps once auth has resolved: callback identities must not retrigger bootstrap. `userRef`
  // supplies the latest User for avatar sync. `lastHomeBootstrapUidRef` avoids flipping feedBootstrapped off unless
  // the account changed.
  useEffect(() => {
    if (!authResolved) return
    if (!user?.id) {
      lastHomeBootstrapUidRef.current = null
      setLikeCounts({})
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      setRethingCounts({})
      setFollowingOtherCount(null)
      setFollowingUserIds(new Set())
      setFeedLoadingInitial(false)
      setFeedHasMore(false)
      setFeedLoadingMore(false)
      setFeedBootstrapped(true)
      void loadPublicPreviewPostsRef.current()
      return
    }
    const uid = user.id
    let cancelled = false
    const sessionUser = userRef.current
    if (!sessionUser || sessionUser.id !== uid) return
    if (lastHomeBootstrapUidRef.current !== uid) {
      setFeedBootstrapped(false)
      lastHomeBootstrapUidRef.current = uid
    }
    void (async () => {
      await syncAvatarToProfile(sessionUser)
      if (cancelled) return
      bootstrapFollowingIdsRef.current = await runHomeBootstrapRef.current(sessionUser.id)
      if (!cancelled) setFeedBootstrapped(true)
    })()
    return () => {
      cancelled = true
    }
  }, [authResolved, user?.id])

  useEffect(() => {
    if (!user?.id) {
      setNotifUnread(false)
      return
    }
    const uid = user.id
    let cancelled = false
    const refreshUnread = async () => {
      if (cancelled) return
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null)
      if (error || cancelled) return
      setNotifUnread((count ?? 0) > 0)
    }
    void refreshUnread()
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        () => {
          setNotifUnread(true)
        },
      )
      .subscribe()
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshUnread()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void supabase.removeChannel(channel)
    }
  }, [user?.id])

  function resetComposer() {
    setTextContent('')
    setQuoteContent('')
    setQuoteAuthor('')
    clearImageComposerState()
    setVideoUrl('')
    setSpotifyUrl('')
    setYoutubeUrl('')
    setArticleUrl('')
    setAudioUrl('')
    setCaption('')
    setTagInput0('')
    setTagInput1('')
    setComposerModuleIds(new Set())
    setPanel(null)
    setActiveEditor(null)
    setLinkPreview(null)
    setTextOnlyLinkPreview(null)
  }

  const textSoleSc = useMemo(
    () => (panel === 'text' ? soleSoundCloudUrlFromTextPost(textContent) : null),
    [panel, textContent],
  )
  const textSoleYt = useMemo(
    () => (panel === 'text' ? soleYoutubeUrlFromTextPost(textContent) : null),
    [panel, textContent],
  )
  const textSoleArticle = useMemo(
    () => (panel === 'text' ? soleGenericArticleUrlFromTextPost(textContent) : null),
    [panel, textContent],
  )

  const canPost = useMemo(() => {
    if (!panel) return false
    if (panel === 'text') return stripHtml(textContent).length > 0
    if (panel === 'quote') return quoteContent.trim().length > 0
    if (panel === 'image') return imageUrl.trim().length > 0 && !imageUploading
    if (panel === 'video') return videoUrl.trim().length > 0
    if (panel === 'audio') return audioUrl.trim().length > 0
    if (panel === 'link') {
      if (linkTab === 'article') return articleUrl.trim().length > 0
      if (linkTab === 'spotify') return spotifyUrl.trim().length > 0
      return youtubeUrl.trim().length > 0
    }
    if (panel === 'place') {
      const name = (placeDetails?.name ?? '').trim() || placeFreeformName.trim()
      return (
        name.length > 0 &&
        !imageUploading &&
        !placeDetailsLoading &&
        !placeGooglePhotoLoading
      )
    }
    return false
  }, [
    panel,
    textContent,
    quoteContent,
    imageUrl,
    imageUploading,
    videoUrl,
    audioUrl,
    linkTab,
    articleUrl,
    spotifyUrl,
    youtubeUrl,
    placeDetails,
    placeFreeformName,
    placeDetailsLoading,
    placeGooglePhotoLoading,
  ])

  function syncRichTextFromActiveEditor() {
    if (!activeEditor) return
    if (activeEditor === 'text' && textEditorRef.current) setTextContent(textEditorRef.current.innerHTML)
    else if (activeEditor === 'caption' && captionEditorRef.current) setCaption(captionEditorRef.current.innerHTML)
  }

  function formatActiveEditor(command: 'bold' | 'italic' | 'createLink') {
    if (!activeEditor) return
    if (command === 'createLink') {
      const raw = window.prompt('Enter URL')
      if (!raw) return
      const url = normalizeLinkUrl(raw)
      document.execCommand('createLink', false, url)
      syncRichTextFromActiveEditor()
      updateToolbarState(activeEditor)
      return
    }
    document.execCommand(command, false)
    syncRichTextFromActiveEditor()
    updateToolbarState(activeEditor)
  }

  function updateToolbarState(targetEditor: EditorTarget | null) {
    const editorEl =
      targetEditor === 'text' ? textEditorRef.current : targetEditor === 'caption' ? captionEditorRef.current : null
    const selection = document.getSelection()
    if (!editorEl || !selection || !selection.anchorNode || !editorEl.contains(selection.anchorNode)) {
      setFormatState({ bold: false, italic: false })
      return
    }
    setFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
    })
  }

  useEffect(() => {
    const handleSelectionChange = () => updateToolbarState(activeEditor)
    document.addEventListener('selectionchange', handleSelectionChange)
    handleSelectionChange()
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [activeEditor])

  useEffect(() => {
    if (!postMenuOpenId) return
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el && !el.closest('[data-post-menu-root]')) setPostMenuOpenId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [postMenuOpenId])

  useEffect(() => {
    if (!postMenuOpenId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPostMenuOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [postMenuOpenId])

  useEffect(() => {
    if (!deleteConfirmPost) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteLoading) setDeleteConfirmPost(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deleteConfirmPost, deleteLoading])

  useEffect(() => {
    if (!rethingSource) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !rethingBusy) {
        setRethingSource(null)
        setRethingCaption('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rethingSource, rethingBusy])

  useEffect(() => {
    if (panel !== 'image' && panel !== 'place') return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i]
        if (item?.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault()
          const f = item.getAsFile()
          if (f) void uploadImageFile(f)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [panel, uploadImageFile])

  useEffect(() => {
    if (panel === 'place') return
    placeAutocompleteLockedRef.current = false
    setPlaceSearchInput('')
    setPlacePredictions([])
    setPlaceDetails(null)
    setPlaceFreeformName('')
    setPlaceDetailsLoading(false)
    setPlaceGooglePhotoLoading(false)
  }, [panel])

  useEffect(() => {
    if (panel !== 'place') return
    const q = placeSearchInput.trim()
    if (q.length < 2) {
      setPlacePredictions([])
      return
    }
    if (placeAutocompleteLockedRef.current) return
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const preds = await fetchPlaceAutocompleteLazy(q)
          if (!cancelled) setPlacePredictions(preds)
        } catch {
          if (!cancelled) setPlacePredictions([])
        }
      })()
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [placeSearchInput, panel])

  async function createPost() {
    if (!user || !panel || !canPost) return
    setLoading(true)
    let type = 'text'
    let content = ''
    const metadata: Record<string, unknown> = {}

    if (panel === 'text') {
      const trimmed = textContent.trim()
      const soleSc = soleSoundCloudUrlFromTextPost(trimmed)
      const soleYt = soleYoutubeUrlFromTextPost(trimmed)
      const soleArticle = soleGenericArticleUrlFromTextPost(trimmed)
      if (soleSc) {
        type = 'soundcloud'
        content = soleSc
      } else if (soleYt) {
        type = 'youtube'
        content = soleYt
      } else if (soleArticle) {
        type = 'article'
        content = soleArticle
        const sameUrl = (a: string, b: string) => {
          try {
            return new URL(normalizeLinkUrl(a)).href === new URL(normalizeLinkUrl(b)).href
          } catch {
            return a === b
          }
        }
        const cached =
          textOnlyLinkPreview &&
          textOnlyLinkPreview.url &&
          sameUrl(textOnlyLinkPreview.url, soleArticle) &&
          linkPreviewHasVisual(textOnlyLinkPreview)
            ? textOnlyLinkPreview
            : null
        if (cached) metadata.link_preview = cached
        else {
          const preview = await fetchLinkPreviewClientLazy(soleArticle)
          if (preview && linkPreviewHasVisual(preview)) metadata.link_preview = preview
        }
      } else {
        type = 'text'
        content = sanitizeRichHtml(trimmed)
      }
    } else if (panel === 'quote') {
      type = 'quote'
      content = quoteContent.trim()
      if (quoteAuthor.trim()) metadata.author = quoteAuthor.trim()
    } else if (panel === 'image') {
      type = 'image'
      content = imageUrl.trim()
    } else if (panel === 'video') {
      if (getYouTubeVideoId(videoUrl.trim())) type = 'youtube'
      else type = 'video'
      content = videoUrl.trim()
    } else if (panel === 'audio') {
      content = normalizeLinkUrl(audioUrl.trim())
      if (isSoundCloudUrl(content)) type = 'soundcloud'
      else if (content.includes('open.spotify.com')) type = 'spotify'
      else type = 'audio'
    } else if (panel === 'link') {
      if (linkTab === 'article') {
        const norm = normalizeLinkUrl(articleUrl.trim())
        if (isSoundCloudUrl(norm)) {
          type = 'soundcloud'
          try {
            content = new URL(norm).href
          } catch {
            content = norm
          }
        } else {
          type = 'article'
          content = norm
        }
      } else if (linkTab === 'spotify') {
        type = 'spotify'
        content = spotifyUrl.trim()
      } else {
        type = 'youtube'
        content = youtubeUrl.trim()
      }
    } else if (panel === 'place') {
      const name = (placeDetails?.name ?? '').trim() || placeFreeformName.trim()
      if (!name) {
        setLoading(false)
        return
      }
      type = 'place'
      content = imageUrl.trim() || ''
      if (placeDetails) {
        metadata.place = {
          name: placeDetails.name.trim(),
          place_id: placeDetails.place_id,
          formatted_address: placeDetails.formatted_address?.trim() || null,
          city: placeDetails.city,
          lat: placeDetails.lat,
          lng: placeDetails.lng,
          source: 'google',
        }
      } else {
        metadata.place = {
          name: placeFreeformName.trim(),
          source: 'freeform',
        }
      }
    }

    if (
      isValidHttpUrl(content) &&
      !metadata.link_preview &&
      type !== 'soundcloud' &&
      type !== 'place' &&
      type !== 'image'
    ) {
      const preview = await fetchLinkPreviewClientLazy(content)
      if (preview && linkPreviewHasVisual(preview)) metadata.link_preview = preview
    }

    const tagList = tagsFromComposerInputs(tagInput0, tagInput1)
    const { data: created, error } = await supabase
      .from('posts')
      .insert({
        type,
        content,
        caption: stripHtml(caption).length ? sanitizeRichHtml(caption.trim()) : null,
        user_id: user.id,
        metadata,
        tags: tagList,
      })
      .select('id')
      .single()

    if (error) alert(`Error creating post: ${error.message}`)
    else {
      const newId = created?.id as string | undefined
      if (newId && composerModuleIds.size > 0) {
        const rows = [...composerModuleIds].map((module_id) => ({ post_id: newId, module_id }))
        const { error: mErr } = await supabase.from('post_modules_user').insert(rows)
        if (mErr) console.error('[modules] composer tags', mErr.message)
      }
      if (newId) void classifyPostAfterSaveLazy(newId)
      resetComposer()
      fetchFeed()
    }
    setLoading(false)
  }

  async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
    if (!isValidHttpUrl(url)) {
      setLinkPreview(null)
      return null
    }
    setPreviewLoading(true)
    try {
      const preview = await fetchLinkPreviewClientLazy(url)
      setLinkPreview(linkPreviewHasVisual(preview) ? preview : null)
      return preview
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (linkTab !== 'article') setLinkPreview(null)
  }, [linkTab])

  useEffect(() => {
    if (panel !== 'link' || linkTab !== 'article') return
    if (!isValidHttpUrl(articleUrl)) {
      setLinkPreview(null)
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setPreviewLoading(true)
        try {
          const preview = await fetchLinkPreviewClientLazy(articleUrl.trim())
          if (!cancelled) setLinkPreview(linkPreviewHasVisual(preview) ? preview : null)
        } finally {
          if (!cancelled) setPreviewLoading(false)
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      setPreviewLoading(false)
    }
  }, [articleUrl, panel, linkTab])

  useEffect(() => {
    if (panel !== 'text') {
      setTextOnlyLinkPreview(null)
      return
    }
    if (!textSoleArticle || !isValidHttpUrl(textSoleArticle)) {
      setTextOnlyLinkPreview(null)
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setTextComposerPreviewLoading(true)
        try {
          const preview = await fetchLinkPreviewClientLazy(textSoleArticle)
          if (!cancelled) setTextOnlyLinkPreview(linkPreviewHasVisual(preview) ? preview : null)
        } finally {
          if (!cancelled) setTextComposerPreviewLoading(false)
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      setTextComposerPreviewLoading(false)
    }
  }, [panel, textSoleArticle])

  function startEditing(post: Post) {
    setEditingPostId(post.id)
  }

  function cancelEditing() {
    setEditingPostId(null)
  }

  async function confirmDeletePost() {
    if (!deleteConfirmPost || !user?.id) return
    setDeleteLoading(true)
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('id', deleteConfirmPost.id)
      .eq('user_id', user.id)
      .select('id')
    if (error) {
      alert(`Could not delete post: ${error.message}`)
    } else if (!data?.length) {
      alert(
        'Could not delete this post. Add a DELETE policy in Supabase (see supabase/policies-posts-delete.sql) if you have not already.',
      )
    } else {
      if (editingPostId === deleteConfirmPost.id) cancelEditing()
      setDeleteConfirmPost(null)
      await fetchFeed()
    }
    setDeleteLoading(false)
  }

  const showPeopleDirectory = Boolean(
    user?.id && profile && feedBootstrapped && feedScope === 'following' && pickPeopleVisible,
  )
  const showSignedInLoadingState = Boolean(
    authResolved &&
      user?.id &&
      !needsUsername &&
      !showPeopleDirectory &&
      (profileLoading || !feedBootstrapped || (feedLoadingInitial && posts.length === 0)),
  )
  // If we already have rows, always show them — do not require feedBootstrapped (it can flicker false during auth churn).
  const showSignedInPostFeed = Boolean(
    user?.id &&
      !showPeopleDirectory &&
      (posts.length > 0 ||
        (feedBootstrapped && (profile != null || followingOtherCount !== null))),
  )

  useEffect(() => {
    isOnboardingFeedRef.current = showPeopleDirectory
  }, [showPeopleDirectory])

  useEffect(() => {
    if (!user?.id) {
      setPickPeopleVisible(false)
    }
  }, [user?.id])

  useLayoutEffect(() => {
    if (!user?.id || !feedBootstrapped || followingOtherCount === null) return
    if (followingOtherCount === 0) {
      setPickPeopleVisible(true)
    }
  }, [user?.id, feedBootstrapped, followingOtherCount])

  useEffect(() => {
    try {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      const urlFeed = params.get('feed')
      if (urlFeed === 'everything' || urlFeed === 'following') {
        setFeedScope(urlFeed)
        localStorage.setItem(HOME_FEED_SCOPE_KEY, urlFeed)
        return
      }
    } catch {
      /* ignore */
    }
    try {
      const v = localStorage.getItem(HOME_FEED_SCOPE_KEY)
      if (v === 'everything' || v === 'following') setFeedScope(v)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!authResolved || !user?.id || !feedBootstrapped) return
    if (feedScope === 'following' && followingOtherCount === null) return
    setFeedHasMore(false)
    void (async () => {
      if (feedScope === 'everything') {
        await fetchEverythingFeed(user.id)
        return
      }
      if (followingOtherCount === 0) {
        setPosts([])
        setAuthorByUserId({})
        await hydrateEngagement(user.id, [])
        setFeedHasMore(false)
        return
      }
      const preloadedFollowingIds = bootstrapFollowingIdsRef.current
      bootstrapFollowingIdsRef.current = null
      await fetchFeedForUser(user.id, preloadedFollowingIds ?? undefined)
    })()
  }, [
    authResolved,
    user?.id,
    feedScope,
    feedBootstrapped,
    followingOtherCount,
    fetchEverythingFeed,
    fetchFeedForUser,
    hydrateEngagement,
  ])

  useEffect(() => {
    if (!user?.id || !feedBootstrapped || showPeopleDirectory || !feedHasMore || feedLoadingMore) return
    const el = feedSentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreFeedRef.current()
      },
      { root: null, rootMargin: '320px', threshold: 0 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [user?.id, feedBootstrapped, showPeopleDirectory, feedHasMore, feedLoadingMore, posts.length])

  const avatarUrl =
    (profile?.avatar_url as string | undefined) || (user?.user_metadata?.avatar_url as string | undefined)
  const activeTypeButton = (type: ComposerType) => panel === type
  const textCount = stripHtml(textContent).length
  const showPublicFeedLoadingState = Boolean(authResolved && !user && publicPreviewLoading && posts.length === 0)
  const showFeedSkeleton = Boolean(!authResolved || showSignedInLoadingState || showPublicFeedLoadingState)

  return (
    <main className="min-h-screen bg-[#fafafa]">
      {rethingSource ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => {
            if (!rethingBusy) {
              setRethingSource(null)
              setRethingCaption('')
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rething-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rething-title" className="text-lg font-medium text-zinc-900">
              Rething to your page
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              This will appear on your profile and in your followers&apos; feeds. The original poster stays credited.
            </p>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-400">Your note (optional)</label>
            <textarea
              value={rethingCaption}
              onChange={(e) => setRethingCaption(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none"
              placeholder="Why are you rethinging this?"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={rethingBusy}
                onClick={() => {
                  setRethingSource(null)
                  setRethingCaption('')
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rethingBusy}
                onClick={() => void confirmRething()}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {rethingBusy ? 'Posting…' : 'Rething'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmPost ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => !deleteLoading && setDeleteConfirmPost(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-post-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-post-title" className="text-lg font-medium text-zinc-900">
              Delete this post?
            </h2>
            <p className="mt-2 text-sm text-zinc-500">This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteConfirmPost(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => void confirmDeletePost()}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <header className="mb-5 flex items-center justify-between gap-3 sm:mb-8">
          <h1 className="min-w-0 text-xl font-light leading-snug tracking-tight text-zinc-900 sm:text-2xl md:text-3xl">
            Things I Like
          </h1>
          {authResolved && user ? (
            <UserNavMenu
              username={profile?.username ?? null}
              avatarUrl={avatarUrl}
              onSignOut={signOut}
              hasUnreadNotifications={notifUnread}
            />
          ) : authResolved ? (
            <button onClick={signInWithGoogle} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
              Sign in with Google
            </button>
          ) : (
            <div className="h-10 w-32 animate-pulse rounded-md bg-zinc-200/80" aria-hidden="true" />
          )}
        </header>

        {user && needsUsername ? (
          <form onSubmit={claimUsername} className="mb-8 rounded-md border border-blue-200 bg-blue-50 p-5">
            <h2 className="mb-2 text-lg font-medium text-zinc-900">Choose your username</h2>
            <p className="mb-4 text-sm text-zinc-500">Your public URL will be `thingsilike.app/{username || 'yourname'}`</p>
            <div className="flex gap-2">
              <input value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="username" className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
              <button type="submit" disabled={!username.trim() || loading} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50">{loading ? 'Claiming...' : 'Claim'}</button>
            </div>
          </form>
        ) : null}

        {authResolved && !user ? (
          <div className="mb-10">
            <div className="mb-5 text-center">
              <p className="text-xl font-light tracking-tight text-zinc-900 sm:text-2xl">No algorithms.</p>
              <p className="mt-1 text-xl font-light tracking-tight text-zinc-900 sm:text-2xl">Just things people like.</p>
            </div>
            <div className="rounded-md border border-zinc-200 bg-white p-6 text-center">
              <p className="mb-3 text-zinc-500">Sign in to start sharing things you like.</p>
              <button onClick={signInWithGoogle} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Sign in with Google</button>
            </div>
          </div>
        ) : null}

        {user && profile ? (
          <>
          <div className="mb-10">
            <p className="mb-4 text-center text-sm font-semibold text-[#8e8e8e]">
              Share something you like
            </p>
            <section className="overflow-hidden rounded-[4px] border border-[#dbdbdb] bg-white">
              <div className="px-5 py-5 sm:px-5 sm:py-5">
                <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
                  {(['image', 'video', 'audio', 'text', 'quote', 'link', 'place'] as ComposerType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPanel(panel === type ? null : type)}
                    className={`inline-flex items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-normal capitalize transition sm:px-3.5 sm:py-2 [&_svg]:h-4 [&_svg]:w-4 ${
                      activeTypeButton(type)
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-[#dbdbdb] bg-white text-[#8e8e8e] hover:border-zinc-900 hover:text-zinc-900'
                    }`}
                  >
                    <ComposerTypeIcon type={type} />
                    <span>{type}</span>
                  </button>
                ))}
                </div>
              </div>

              {panel ? (
                <div className="border-t border-[#dbdbdb]">
                  <div className="p-3.5">
                    {panel === 'image' ? (
                      <div className="space-y-3">
                        <input
                          ref={imageFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadImageFile(f)
                            e.target.value = ''
                          }}
                        />
                        {!imageUrl && !imageLocalPreview ? (
                          <div
                            className={`flex overflow-hidden rounded-[4px] border-[1.5px] border-dashed border-[#dbdbdb] transition-colors ${
                              imageDropActive ? 'bg-zinc-50' : ''
                            }`}
                            onDragOver={(e) => {
                              e.preventDefault()
                              setImageDropActive(true)
                            }}
                            onDragLeave={(e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) setImageDropActive(false)
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              setImageDropActive(false)
                              const f = e.dataTransfer.files?.[0]
                              if (f?.type.startsWith('image/')) void uploadImageFile(f)
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => imageFileInputRef.current?.click()}
                              className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-7 text-center transition-colors hover:bg-zinc-50"
                            >
                              <svg className="mb-1 h-[26px] w-[26px] text-[#b8b8b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <polyline points="16 16 12 12 8 16" />
                                <line x1="12" y1="12" x2="12" y2="21" />
                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                              </svg>
                              <span className="text-sm font-semibold text-zinc-900">
                                Drop or <span className="text-[#0095f6]">browse</span>
                              </span>
                              <span className="text-xs text-[#8e8e8e]">JPG, PNG, GIF, WebP</span>
                            </button>
                            <div className="w-px shrink-0 bg-[#dbdbdb]" />
                            <span className="flex shrink-0 items-center px-2 text-[11px] text-[#b8b8b8]">or</span>
                            <div className="w-px shrink-0 bg-[#dbdbdb]" />
                            <button
                              type="button"
                              tabIndex={0}
                              onClick={(e) => (e.target as HTMLElement).focus()}
                              className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-7 text-center outline-none transition-colors focus:bg-[#f0f6ff] focus:ring-2 focus:ring-inset focus:ring-blue-200"
                            >
                              <svg className="mb-1 h-[26px] w-[26px] text-[#b8b8b8] focus-within:text-[#0095f6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                                <rect x="9" y="2" width="6" height="4" rx="1" />
                                <path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" />
                                <line x1="12" y1="11" x2="12" y2="17" />
                                <line x1="9" y1="14" x2="15" y2="14" />
                              </svg>
                              <span className="text-sm font-semibold text-zinc-900">Click, then paste</span>
                              <span className="text-xs text-[#8e8e8e]">Cmd+V / Ctrl+V</span>
                            </button>
                          </div>
                        ) : (
                          <div className="relative overflow-hidden rounded-[4px] border border-[#dbdbdb]">
                            <img
                              src={imageLocalPreview || imageUrl}
                              alt="Selected"
                              className="mx-auto max-h-[min(50vh,400px)] w-full object-contain bg-white"
                            />
                            {imageUploading ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-zinc-600">Uploading…</div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => clearImageComposerState()}
                              disabled={imageUploading}
                              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-50"
                              aria-label="Remove image"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        )}
                        <div>
                          <p className="mb-1 text-xs text-[#8e8e8e]">Or paste an image URL</p>
                          <input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (!raw.trim()) {
                                clearImageComposerState()
                                return
                              }
                              setImageUrl(raw)
                              setImageLocalPreview((prev) => {
                                if (prev) URL.revokeObjectURL(prev)
                                return null
                              })
                            }}
                            placeholder="https://…"
                            disabled={imageUploading}
                            className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    ) : null}

                  {panel === 'place' ? (
                    <div className="space-y-4">
                      <div className="relative" ref={placeComboRef}>
                        <p className="mb-1 text-xs font-medium text-[#8e8e8e]">Search Google Maps</p>
                        <input
                          type="text"
                          value={placeSearchInput}
                          onChange={(e) => {
                            placeAutocompleteLockedRef.current = false
                            setPlaceSearchInput(e.target.value)
                          }}
                          onBlur={() => {
                            requestAnimationFrame(() => {
                              const root = placeComboRef.current
                              if (!root || root.contains(document.activeElement)) return
                              setPlacePredictions([])
                            })
                          }}
                          placeholder="Restaurant, park, neighborhood…"
                          disabled={placeDetailsLoading}
                          className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none disabled:opacity-50"
                        />
                        {placePredictions.length > 0 ? (
                          <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-[#dbdbdb] bg-white py-1 shadow-lg" role="listbox">
                            {placePredictions.map((p) => (
                              <li key={p.placeId}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    placeAutocompleteLockedRef.current = true
                                    setPlacePredictions([])
                                    setPlaceSearchInput(p.mainText)
                                    void (async () => {
                                      setPlaceDetailsLoading(true)
                                      try {
                                        const d = await fetchPlaceDetailsLazy(p.placeId)
                                        setPlaceDetails(d)
                                      } finally {
                                        setPlaceDetailsLoading(false)
                                      }
                                    })()
                                  }}
                                >
                                  <span className="block font-medium text-zinc-900">{p.mainText}</span>
                                  {p.secondaryText ? (
                                    <span className="block text-xs text-zinc-500">{p.secondaryText}</span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>

                      {placeDetailsLoading ? <p className="text-sm text-zinc-500">Loading place…</p> : null}

                      {placeDetails ? (
                        <div className="rounded-[4px] border border-[#dbdbdb] bg-zinc-50/80 px-3 py-2.5 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-900">{placeDetails.name}</p>
                              {placeDetails.formatted_address ? (
                                <p className="mt-0.5 text-xs text-zinc-600">{placeDetails.formatted_address}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                placeAutocompleteLockedRef.current = false
                                setPlaceDetails(null)
                                setPlaceFreeformName(placeDetails.name)
                              }}
                              className="shrink-0 text-xs font-semibold text-[#0095f6] hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                          {placeDetails.photoReference ? (
                            <button
                              type="button"
                              disabled={placeGooglePhotoLoading || imageUploading}
                              onClick={() => {
                                void (async () => {
                                  setPlaceGooglePhotoLoading(true)
                                  try {
                                    const url = await cacheGooglePlacePhotoLazy(placeDetails.photoReference!)
                                    if (url) setImageUrl(url)
                                  } finally {
                                    setPlaceGooglePhotoLoading(false)
                                  }
                                })()
                              }}
                              className="mt-2 text-xs font-semibold text-zinc-700 underline decoration-zinc-400 hover:text-zinc-900 disabled:opacity-40"
                            >
                              {placeGooglePhotoLoading ? 'Adding photo…' : 'Use Google cover photo'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      <div>
                        <p className="mb-1 text-xs font-medium text-[#8e8e8e]">
                          {placeDetails ? 'Using Google place above' : 'Or enter a place name (no map link)'}
                        </p>
                        <input
                          type="text"
                          value={placeFreeformName}
                          onChange={(e) => setPlaceFreeformName(e.target.value)}
                          placeholder="e.g. My favorite bench, Aunt’s kitchen…"
                          disabled={!!placeDetails}
                          className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
                        />
                        {placeDetails ? (
                          <p className="mt-1 text-[11px] text-[#b8b8b8]">Clear the Google result to post a plain name only.</p>
                        ) : null}
                      </div>

                      <div className="space-y-3 border-t border-[#dbdbdb] pt-3">
                        <p className="text-xs font-medium text-[#8e8e8e]">Cover photo (optional)</p>
                        <input
                          ref={imageFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadImageFile(f)
                            e.target.value = ''
                          }}
                        />
                        {!imageUrl && !imageLocalPreview ? (
                          <button
                            type="button"
                            onClick={() => imageFileInputRef.current?.click()}
                            className="w-full rounded-[4px] border border-dashed border-[#dbdbdb] px-3 py-6 text-center text-sm text-zinc-700 hover:bg-zinc-50"
                          >
                            Upload an image (optional)
                          </button>
                        ) : (
                          <div className="relative overflow-hidden rounded-[4px] border border-[#dbdbdb]">
                            <img
                              src={imageLocalPreview || imageUrl}
                              alt=""
                              className="mx-auto max-h-[min(40vh,320px)] w-full object-contain bg-white"
                            />
                            {imageUploading ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-zinc-600">
                                Uploading…
                              </div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => clearImageComposerState()}
                              disabled={imageUploading}
                              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-50"
                              aria-label="Remove image"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        )}
                        <div>
                          <p className="mb-1 text-xs text-[#8e8e8e]">Or image URL</p>
                          <input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (!raw.trim()) {
                                clearImageComposerState()
                                return
                              }
                              setImageUrl(raw)
                              setImageLocalPreview((prev) => {
                                if (prev) URL.revokeObjectURL(prev)
                                return null
                              })
                            }}
                            placeholder="https://…"
                            disabled={imageUploading}
                            className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {panel === 'video' ? (
                    <>
                      <input
                        type="url"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="Paste video URL (YouTube or direct link)..."
                        className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none"
                      />
                      {getYouTubeVideoId(videoUrl) ? (
                        <div
                          className="relative mt-3 w-full overflow-hidden rounded-md border border-zinc-200 bg-black"
                          style={{ paddingBottom: '56.25%' }}
                        >
                          <iframe
                            title="YouTube preview"
                            src={`https://www.youtube.com/embed/${getYouTubeVideoId(videoUrl)}`}
                            className="absolute left-0 top-0 h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {panel === 'audio' ? (
                    <>
                      <input
                        type="url"
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="Paste Spotify or SoundCloud URL..."
                        className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none"
                      />
                      {(() => {
                        const c = normalizeLinkUrl(audioUrl.trim())
                        if (!c) return null
                        const sc = getSoundCloudWidgetSrc(c)
                        if (sc) {
                          return (
                            <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
                              <iframe
                                title="SoundCloud preview"
                                src={sc}
                                width="100%"
                                height={260}
                                className="block w-full border-0"
                                allow="autoplay"
                              />
                            </div>
                          )
                        }
                        const sp = getSpotifyEmbedUrl(c)
                        if (sp) {
                          return (
                            <iframe
                              title="Spotify preview"
                              src={sp}
                              width="100%"
                              height={152}
                              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                              loading="lazy"
                              className="mt-3 rounded-md border border-zinc-200"
                            />
                          )
                        }
                        return null
                      })()}
                    </>
                  ) : null}

                  {panel === 'text' ? (
                    <>
                      <div className="mb-2 flex gap-1">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('bold')} className={`h-7 w-7 rounded-[3px] text-xs hover:bg-zinc-100 hover:text-zinc-900 ${formatState.bold ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}><strong>B</strong></button>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('italic')} className={`h-7 w-7 rounded-[3px] text-xs italic hover:bg-zinc-100 hover:text-zinc-900 ${formatState.italic ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}>I</button>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('createLink')} className="h-7 w-7 rounded-[3px] text-xs text-[#8e8e8e] hover:bg-zinc-100 hover:text-zinc-900">Link</button>
                      </div>
                      <RichTextEditor
                        value={textContent}
                        onChange={setTextContent}
                        onFocus={() => {
                          setActiveEditor('text')
                          updateToolbarState('text')
                        }}
                        placeholder="What&apos;s on your mind?"
                        className="min-h-[110px] w-full text-sm leading-relaxed text-zinc-900 focus:outline-none [&_a]:text-blue-600 [&_a]:underline"
                        editorRef={textEditorRef}
                        maxPlainTextLength={500}
                        onProfilePathNavigate={(p) => router.push(p)}
                      />
                      {textSoleYt && getYouTubeVideoId(textSoleYt) ? (
                        <div
                          className="relative mt-3 w-full overflow-hidden rounded-md bg-black"
                          style={{ paddingBottom: '56.25%' }}
                        >
                          <iframe
                            title="YouTube preview"
                            src={`https://www.youtube.com/embed/${getYouTubeVideoId(textSoleYt)}`}
                            className="absolute left-0 top-0 h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : null}
                      {textSoleSc && getSoundCloudWidgetSrc(textSoleSc) ? (
                        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
                          <iframe
                            title="SoundCloud preview"
                            src={getSoundCloudWidgetSrc(textSoleSc) || ''}
                            width="100%"
                            height={260}
                            className="block w-full border-0"
                            allow="autoplay"
                          />
                        </div>
                      ) : null}
                      {textComposerPreviewLoading && textSoleArticle ? (
                        <div className="mt-3 h-28 animate-pulse rounded-md bg-zinc-100" aria-hidden />
                      ) : null}
                      {(() => {
                        const tlp = textOnlyLinkPreview
                        if (!textSoleArticle || !tlp || !linkPreviewHasVisual(tlp)) return null
                        return (
                        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200">
                          {tlp.image ? (
                            <img src={tlp.image} alt={tlp.title || ''} className="h-36 w-full object-cover" />
                          ) : null}
                          <div className="p-3">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
                              {tlp.siteName || getHostnameLabel(textSoleArticle)}
                            </p>
                            <p className="text-sm font-semibold text-zinc-900">
                              {tlp.title?.trim() || getHostnameLabel(textSoleArticle)}
                            </p>
                            {tlp.description ? (
                              <p className="line-clamp-2 text-xs text-zinc-500">{tlp.description}</p>
                            ) : null}
                          </div>
                        </div>
                        )
                      })()}
                      {!textComposerPreviewLoading &&
                      textSoleArticle &&
                      !linkPreviewHasVisual(textOnlyLinkPreview) ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          No preview for this URL—the post will still save as a rich link card when it&apos;s only this link.
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  {panel === 'quote' ? (
                    <>
                      <textarea value={quoteContent} onChange={(e) => setQuoteContent(e.target.value)} placeholder="Paste or type the quote..." className="min-h-[80px] w-full resize-y text-[17px] italic text-zinc-900 placeholder:text-[#b8b8b8] focus:outline-none" />
                      <div className="mt-3 flex items-center gap-2 border-t border-[#dbdbdb] pt-3">
                        <span className="text-sm text-[#8e8e8e]">-</span>
                        <input value={quoteAuthor} onChange={(e) => setQuoteAuthor(e.target.value)} placeholder="Who said it? (optional)" className="w-full text-sm italic text-[#8e8e8e] placeholder:text-[#b8b8b8] focus:outline-none" />
                      </div>
                    </>
                  ) : null}

                  {panel === 'link' ? (
                    <>
                      <div className="mb-3 flex border-b border-[#dbdbdb]">
                        {(['article', 'spotify', 'youtube'] as LinkTab[]).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setLinkTab(tab)}
                            className={`flex-1 border-b-2 py-2 text-xs font-semibold capitalize ${
                              linkTab === tab ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-[#8e8e8e] hover:text-zinc-900'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                      {linkTab === 'article' ? (
                        <>
                          <div className="flex gap-2">
                            <input type="url" value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="Article or SoundCloud URL…" className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" />
                            <button
                              type="button"
                              onClick={() => void fetchLinkPreview(articleUrl)}
                              disabled={!isValidHttpUrl(articleUrl) || previewLoading}
                              className="rounded-[4px] border border-[#dbdbdb] px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-50"
                            >
                              {previewLoading ? '…' : 'Refresh'}
                            </button>
                          </div>
                          {(() => {
                            const lp = linkPreview
                            if (!lp || !linkPreviewHasVisual(lp)) return null
                            return (
                            <div className="mt-3 overflow-hidden rounded-md border border-zinc-200">
                              {lp.image ? (
                                <img src={lp.image} alt={lp.title || ''} className="h-36 w-full object-cover" />
                              ) : null}
                              <div className="p-3">
                                <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
                                  {lp.siteName || getHostnameLabel(articleUrl)}
                                </p>
                                <p className="text-sm font-semibold text-zinc-900">
                                  {lp.title?.trim() || getHostnameLabel(articleUrl)}
                                </p>
                                {lp.description ? (
                                  <p className="line-clamp-2 text-xs text-zinc-500">{lp.description}</p>
                                ) : null}
                              </div>
                            </div>
                            )
                          })()}
                          {previewLoading && isValidHttpUrl(articleUrl) ? (
                            <div className="mt-3 h-28 animate-pulse rounded-md bg-zinc-100" aria-hidden />
                          ) : null}
                          {!previewLoading && isValidHttpUrl(articleUrl) && !linkPreviewHasVisual(linkPreview) ? (
                            <p className="mt-2 text-xs text-zinc-500">
                              No preview for this URL—the post will still save as a link.
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      {linkTab === 'spotify' ? (
                        <>
                          <input
                            type="url"
                            value={spotifyUrl}
                            onChange={(e) => setSpotifyUrl(e.target.value)}
                            placeholder="Paste Spotify URL..."
                            className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none"
                          />
                          {getSpotifyEmbedUrl(spotifyUrl) ? (
                            <iframe
                              title="Spotify preview"
                              src={getSpotifyEmbedUrl(spotifyUrl) || ''}
                              width="100%"
                              height={152}
                              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                              loading="lazy"
                              className="mt-3 rounded-md border border-zinc-200"
                            />
                          ) : null}
                        </>
                      ) : null}
                      {linkTab === 'youtube' ? (
                        <>
                          <input
                            type="url"
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            placeholder="Paste YouTube URL..."
                            className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none"
                          />
                          {getYouTubeVideoId(youtubeUrl) ? (
                            <div
                              className="relative mt-3 w-full overflow-hidden rounded-md border border-zinc-200 bg-black"
                              style={{ paddingBottom: '56.25%' }}
                            >
                              <iframe
                                title="YouTube preview"
                                src={`https://www.youtube.com/embed/${getYouTubeVideoId(youtubeUrl)}`}
                                className="absolute left-0 top-0 h-full w-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>

                {panel !== 'text' ? (
                  <div className="border-t border-[#dbdbdb] px-3.5 py-2.5">
                    <div className="mb-2 flex gap-1">
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('bold')} className={`h-7 w-7 rounded-[3px] text-xs hover:bg-zinc-100 hover:text-zinc-900 ${formatState.bold ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}><strong>B</strong></button>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('italic')} className={`h-7 w-7 rounded-[3px] text-xs italic hover:bg-zinc-100 hover:text-zinc-900 ${formatState.italic ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}>I</button>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('createLink')} className="h-7 w-7 rounded-[3px] text-xs text-[#8e8e8e] hover:bg-zinc-100 hover:text-zinc-900">Link</button>
                    </div>
                    <RichTextEditor
                      value={caption}
                      onChange={setCaption}
                      onFocus={() => {
                        setActiveEditor('caption')
                        updateToolbarState('caption')
                      }}
                      placeholder={
                        panel === 'link'
                          ? 'Add a note... why does this matter to you?'
                          : panel === 'place'
                            ? 'Say something about this place…'
                            : 'Add a caption...'
                      }
                      className="min-h-[32px] w-full text-sm text-zinc-700 focus:outline-none [&_a]:text-blue-600 [&_a]:underline"
                      editorRef={captionEditorRef}
                      onProfilePathNavigate={(p) => router.push(p)}
                    />
                  </div>
                ) : null}

                <div className="border-t border-[#dbdbdb] px-3.5 py-2.5">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8e8e8e]">Tags (optional, max 2)</p>
                  <p className="mb-2 text-[11px] text-[#b8b8b8]">Letters, numbers, hyphens. Click a tag on a post to see more like it.</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={tagInput0}
                      onChange={(e) => setTagInput0(e.target.value)}
                      placeholder="e.g. jazz"
                      maxLength={40}
                      className="min-w-[8rem] flex-1 rounded-[4px] border border-[#dbdbdb] px-3 py-2 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none"
                    />
                    <input
                      value={tagInput1}
                      onChange={(e) => setTagInput1(e.target.value)}
                      placeholder="second tag"
                      maxLength={40}
                      className="min-w-[8rem] flex-1 rounded-[4px] border border-[#dbdbdb] px-3 py-2 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none"
                    />
                  </div>
                </div>

                <ComposerModuleChips
                  modules={profileModulesForComposer}
                  selectedIds={composerModuleIds}
                  aiMaySuggestMore={profile?.modules_ai_enabled !== false}
                  onToggle={(id) =>
                    setComposerModuleIds((prev) => {
                      const n = new Set(prev)
                      if (n.has(id)) n.delete(id)
                      else n.add(id)
                      return n
                    })
                  }
                  className="border-t border-[#dbdbdb] px-3.5 py-2.5"
                />

                <div className="flex items-center gap-2 border-t border-[#dbdbdb] px-3.5 py-2.5">
                  <p className={`mr-auto text-[11px] ${panel === 'text' && textCount > 450 ? 'text-red-400' : 'text-[#b8b8b8]'}`}>
                    {panel === 'text' ? `${textCount} / 500` : ''}
                  </p>
                  <button type="button" onClick={resetComposer} className="text-[13px] font-semibold text-[#8e8e8e] hover:text-zinc-900">Cancel</button>
                  <button
                    type="button"
                    onClick={createPost}
                    disabled={!canPost || loading || imageUploading || placeDetailsLoading || placeGooglePhotoLoading}
                    className="rounded-full bg-zinc-900 px-4.5 py-1.5 text-[13px] font-bold text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? 'Posting...' : 'Post'}
                  </button>
                </div>
                </div>
              ) : null}
            </section>
          </div>
          {user && profile && !needsUsername ? (
            <div ref={feedTabsRef} className="mb-8 flex justify-center" role="tablist" aria-label="Home feed">
              <div className="flex w-full max-w-sm rounded-[4px] border border-[#dbdbdb] bg-white p-0.5 sm:max-w-md">
                <button
                  type="button"
                  role="tab"
                  aria-selected={feedScope === 'following'}
                  onClick={switchFeedToFollowing}
                  className={`min-h-10 flex-1 rounded-[3px] px-4 py-2 text-center text-sm font-semibold transition-colors sm:px-6 ${
                    feedScope === 'following'
                      ? 'bg-zinc-900 text-white'
                      : 'text-[#8e8e8e] hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  Following
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={feedScope === 'everything'}
                  onClick={switchFeedToEverything}
                  className={`min-h-10 flex-1 rounded-[3px] px-4 py-2 text-center text-sm font-semibold transition-colors sm:px-6 ${
                    feedScope === 'everything'
                      ? 'bg-zinc-900 text-white'
                      : 'text-[#8e8e8e] hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  EveryThing
                </button>
              </div>
            </div>
          ) : null}
          {showPeopleDirectory ? (
            <div className="mb-10">
              <h2 className="mb-2 text-lg font-semibold text-zinc-900">People Who Like Things</h2>
              <p className="mb-1 max-w-xl text-sm leading-relaxed text-zinc-600">Follow some people to see the things they like.</p>
              <PeopleWhoLikeThingsDirectory
                currentUserId={user.id}
                refreshKey={directoryRefreshKey}
                onFollowChanged={() => void refetchFollowingCount()}
                onboardingOnly
              />
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleRecommendationsContinue}
                  className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  See Things People Like
                </button>
              </div>
            </div>
          ) : null}
          </>
        ) : null}

        <section className="space-y-6">
          {authResolved && !user && posts.length > 0 ? (
            <h2 className="text-sm font-medium text-zinc-600">Latest posts</h2>
          ) : null}
          {showFeedSkeleton ? <HomeFeedSkeleton /> : null}
          {!showFeedSkeleton && user && profile && feedBootstrapped && !showPeopleDirectory && posts.length === 0 ? (
            <p className="py-12 text-center text-zinc-400">
              {feedScope === 'everything'
                ? 'Nothing here yet. Check back as people post.'
                : 'No posts yet. Follow someone or share something you like.'}
            </p>
          ) : null}
          {!showFeedSkeleton && authResolved && !user && posts.length === 0 ? (
            <p className="py-12 text-center text-zinc-400">Nothing posted yet. Sign in to share something you like.</p>
          ) : null}
          {!showFeedSkeleton &&
            (!user || showSignedInPostFeed) &&
            posts.map((post) => {
            const author = post.user_id ? authorByUserId[post.user_id] : undefined
            const rethingOrig = authorMetaForRethingFromUsername(authorByUserId, post.rething_from_username)
            const canInlineFollowAuthor = Boolean(
              user?.id &&
                post.user_id &&
                post.user_id !== user.id &&
                author?.username &&
                followingOtherCount !== null &&
                !followingUserIds.has(post.user_id),
            )
            return (
            <div key={post.id}>
              <PostCard
                post={post}
                isOwner={user?.id === post.user_id}
                authorUsername={author?.username ?? null}
                authorAvatarUrl={author?.avatar_url ?? null}
                rethingFromAvatarUrl={rethingOrig?.avatar_url ?? null}
                authorFollow={
                  canInlineFollowAuthor && post.user_id && author?.username
                    ? { userId: post.user_id, username: author.username }
                    : null
                }
                onAuthorFollowChange={() => void refetchFollowingCount()}
                showAuthor={!!author?.username}
                dashboardActions={!!user}
                profileLikeBar={!user}
                likeCount={likeCounts[post.id] ?? 0}
                rethingCount={rethingCounts[post.id] ?? 0}
                liked={likedPostIds.has(post.id)}
                onLike={user?.id && post.user_id !== user.id ? () => void toggleLike(post.id) : undefined}
                bookmarked={bookmarkedPostIds.has(post.id)}
                onBookmark={user?.id && post.user_id !== user.id ? () => void toggleBookmark(post.id) : undefined}
                onRething={user?.id && post.user_id !== user.id ? () => setRethingSource(post) : undefined}
                menuOpen={postMenuOpenId === post.id}
                onMenuToggle={() => setPostMenuOpenId((cur) => (cur === post.id ? null : post.id))}
                onEditClick={() => {
                  startEditing(post)
                  setPostMenuOpenId(null)
                }}
                onDeleteClick={() => {
                  setDeleteConfirmPost(post)
                  setPostMenuOpenId(null)
                }}
                onModulesClick={
                  user?.id === post.user_id
                    ? () => {
                        setModulesSheetPost(post)
                        setPostMenuOpenId(null)
                      }
                    : undefined
                }
                shareAuthorUsername={author?.username ?? null}
              />
              {user?.id === post.user_id && editingPostId === post.id ? (
                <InlinePostEditor
                  post={post}
                  userId={user.id}
                  onCancel={cancelEditing}
                  onSaved={() => void fetchFeed()}
                />
              ) : null}
            </div>
            )
          })}
          {user && !showPeopleDirectory && feedHasMore ? (
            <div
              ref={feedSentinelRef}
              className="flex min-h-10 flex-col items-center justify-center gap-2 py-8"
              aria-hidden={!feedLoadingMore}
            >
              {feedLoadingMore ? (
                <span className="text-sm text-zinc-400">Loading more…</span>
              ) : (
                <span className="sr-only">More posts load as you scroll</span>
              )}
            </div>
          ) : null}
          {user &&
          !showPeopleDirectory &&
          !feedHasMore &&
          !feedLoadingInitial &&
          feedScope === 'following' &&
          (followingOtherCount ?? 0) > 0 &&
          posts.length > 0 ? (
            <div className="pt-2">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-5 py-6 text-center">
                <p className="text-sm text-zinc-600">Want to keep browsing beyond the people you follow?</p>
                <button
                  type="button"
                  onClick={switchFeedToEverything}
                  className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  See things people like
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <HomeLegalFooter />
      </div>

      <PostModulesSheet
        post={modulesSheetPost}
        modules={profileModulesForComposer}
        open={modulesSheetPost !== null}
        onClose={() => setModulesSheetPost(null)}
        onUpdated={() => {
          setModulesSheetPost(null)
          void fetchFeed()
        }}
      />
    </main>
  )
}
