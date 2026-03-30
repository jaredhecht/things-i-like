'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ComposerTypeIcon } from '../src/components/ComposerTypeIcons'
import { ComposerModuleChips } from '../src/components/ComposerModuleChips'
import { InlinePostEditor } from '../src/components/InlinePostEditor'
import { PostCard } from '../src/components/PostCard'
import { RichTextEditor } from '../src/components/RichTextEditor'
import { PeopleWhoLikeThingsDirectory } from '../src/components/PeopleWhoLikeThingsDirectory'
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
import { fetchRecentPostsForAuthorIds } from '../src/lib/posts-batched'
import { fetchEngagementForPostIds } from '../src/lib/engagement-client'
import { PostModulesSheet } from '../src/components/PostModulesSheet'
import { classifyPostAfterSave } from '../src/lib/modules-ui'
import type { ProfileModuleRow } from '../src/lib/modules-ui'
import { fetchLinkPreviewClient } from '../src/lib/link-preview-client'
import { oauthSignInRedirectOptions } from '../src/lib/oauth-redirect'
import { tagsFromComposerInputs, parsePostTags } from '../src/lib/post-tags'
import { fetchRethingCountsForPostIds } from '../src/lib/rething-counts'
import { supabase } from '../src/lib/supabase'

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

type ComposerType = 'image' | 'video' | 'link' | 'text' | 'quote' | 'audio'
type LinkTab = 'article' | 'spotify' | 'youtube'
type EditorTarget = 'text' | 'caption'

const POST_IMAGES_BUCKET = 'post-images'
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
/** Signed-out home: at most one recent post per author, up to this many distinct authors. */
const PUBLIC_PREVIEW_MAX_POSTS = 10
const PUBLIC_PREVIEW_PAGE = 150
const PUBLIC_PREVIEW_MAX_PAGES = 40
const PROFILE_IN_CHUNK = 100
/** Home feed: only load the newest N posts across you + people you follow (full history is expensive). */
const SIGNED_IN_FEED_LIMIT = 150
/** sessionStorage: user chose main feed while still in follow-someone onboarding (cleared when follow count hits 0). */
const MAIN_FEED_STORAGE_KEY = 'til_onboarding_main_feed'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
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
  const isOnboardingFeedRef = useRef(false)
  const [followingOtherCount, setFollowingOtherCount] = useState<number | null>(null)
  const [choseMainFeed, setChoseMainFeed] = useState(false)
  const [feedBootstrapped, setFeedBootstrapped] = useState(false)
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0)

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

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) {
      setProfile(data)
      setNeedsUsername(false)
    } else {
      setNeedsUsername(true)
    }
    const { data: mods } = await supabase
      .from('profile_modules')
      .select('id, name, sort_order, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order')
    setProfileModulesForComposer((mods || []) as ProfileModuleRow[])
  }

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
    if (typeof window !== 'undefined') sessionStorage.removeItem(MAIN_FEED_STORAGE_KEY)
    await supabase.auth.signOut()
    setUser(null)
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
    const { likeCounts: countByPost, likedPostIds: my, bookmarkedPostIds: bookmarks } = await fetchEngagementForPostIds(
      supabase,
      userId,
      ids,
    )
    const rethingByPost = await fetchRethingCountsForPostIds(supabase, ids)
    setLikeCounts(countByPost)
    setLikedPostIds(my)
    setBookmarkedPostIds(bookmarks)
    setRethingCounts(rethingByPost)
  }, [])

  const loadPublicPreviewPosts = useCallback(async () => {
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
    setPosts(picked)
    setAuthorByUserId(map)
  }, [])

  const fetchFeedForUser = useCallback(
    async (userId: string) => {
      const { data: follows, error: followErr } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      if (followErr) console.error('Error fetching follows:', followErr)
      const followingIds = [...new Set((follows || []).map((f) => f.following_id))]
      const authorIds = [...new Set([userId, ...followingIds])]
      let list: Post[] = []
      try {
        list = await fetchRecentPostsForAuthorIds(supabase, authorIds, SIGNED_IN_FEED_LIMIT)
      } catch (error) {
        console.error('Error fetching feed:', error)
      }
      const { data: profs } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', authorIds)
      const map: Record<string, AuthorMeta> = {}
      for (const p of profs || []) {
        map[p.id] = {
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url ?? null,
        }
      }
      setAuthorByUserId(map)
      setPosts(list)
      await hydrateEngagement(userId, list)
    },
    [hydrateEngagement],
  )

  const runHomeBootstrap = useCallback(
    async (userId: string) => {
      const { data: follows, error: followErr } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      if (followErr) console.error('Error fetching follows (bootstrap):', followErr)
      const n = (follows || []).length
      setFollowingOtherCount(n)
      const clearSignedInFeed = () => {
        setPosts([])
        setAuthorByUserId({})
        setLikeCounts({})
        setLikedPostIds(new Set())
        setBookmarkedPostIds(new Set())
        setRethingCounts({})
      }
      if (n === 0) {
        if (typeof window !== 'undefined') sessionStorage.removeItem(MAIN_FEED_STORAGE_KEY)
        setChoseMainFeed(false)
        clearSignedInFeed()
        return
      }
      const wantsMain =
        typeof window !== 'undefined' && sessionStorage.getItem(MAIN_FEED_STORAGE_KEY) === '1'
      setChoseMainFeed(wantsMain)
      if (wantsMain) {
        await fetchFeedForUser(userId)
      } else {
        clearSignedInFeed()
      }
    },
    [fetchFeedForUser],
  )

  const refetchFollowingCount = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    if (error) {
      console.error('refetchFollowingCount:', error)
      return
    }
    const n = (data || []).length
    setFollowingOtherCount(n)
    if (n === 0) {
      if (typeof window !== 'undefined') sessionStorage.removeItem(MAIN_FEED_STORAGE_KEY)
      setChoseMainFeed(false)
      setPosts([])
      setAuthorByUserId({})
      setLikeCounts({})
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      setRethingCounts({})
    }
  }, [user?.id])

  async function fetchFeed() {
    const {
      data: { user: u },
    } = await supabase.auth.getUser()
    if (!u) return
    if (isOnboardingFeedRef.current) {
      setDirectoryRefreshKey((k) => k + 1)
      return
    }
    await fetchFeedForUser(u.id)
  }

  function goToMainFeed() {
    if (!user?.id) return
    if (typeof window !== 'undefined') sessionStorage.setItem(MAIN_FEED_STORAGE_KEY, '1')
    setChoseMainFeed(true)
    void fetchFeedForUser(user.id)
  }

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
    const metadata =
      rethingSource.metadata && typeof rethingSource.metadata === 'object' ? { ...rethingSource.metadata } : {}
    const rethingTags = parsePostTags(rethingSource.tags)
    const { data: rethingRow, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        type: rethingSource.type,
        content: rethingSource.content,
        caption: stripHtml(rethingCaption).length ? rethingCaption.trim() : null,
        metadata,
        rething_of_post_id: rethingSource.id,
        rething_from_username: origAuthor,
        tags: rethingTags.length ? rethingTags : [],
      })
      .select('id')
      .single()
    if (error) alert(`Could not rething: ${error.message}`)
    else {
      if (rethingRow?.id) void classifyPostAfterSave(rethingRow.id as string)
      setRethingSource(null)
      setRethingCaption('')
      await fetchFeed()
    }
    setRethingBusy(false)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u)
      if (u) void loadProfile(u.id)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) void loadProfile(currentUser.id)
      if (!currentUser) {
        setProfile(null)
        setNeedsUsername(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setLikeCounts({})
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      setRethingCounts({})
      setFollowingOtherCount(null)
      setChoseMainFeed(false)
      setFeedBootstrapped(true)
      void loadPublicPreviewPosts()
      return
    }
    let cancelled = false
    setFeedBootstrapped(false)
    const sessionUser = user
    void (async () => {
      await syncAvatarToProfile(sessionUser)
      if (cancelled) return
      await runHomeBootstrap(sessionUser.id)
      if (!cancelled) setFeedBootstrapped(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user, runHomeBootstrap, loadPublicPreviewPosts])

  useEffect(() => {
    if (!user?.id) {
      setNotifUnread(false)
      return
    }
    const uid = user.id
    let cancelled = false
    const refreshUnread = async () => {
      const {
        data: { user: current },
      } = await supabase.auth.getUser()
      if (!current?.id || cancelled) return
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', current.id)
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
    return false
  }, [panel, textContent, quoteContent, imageUrl, imageUploading, videoUrl, audioUrl, linkTab, articleUrl, spotifyUrl, youtubeUrl])

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
    if (panel !== 'image') return
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
          const preview = await fetchLinkPreviewClient(soleArticle)
          if (preview && linkPreviewHasVisual(preview)) metadata.link_preview = preview
        }
      } else {
        type = 'text'
        content = trimmed
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
    }

    if (isValidHttpUrl(content) && !metadata.link_preview && type !== 'soundcloud') {
      const preview = await fetchLinkPreviewClient(content)
      if (preview && linkPreviewHasVisual(preview)) metadata.link_preview = preview
    }

    const tagList = tagsFromComposerInputs(tagInput0, tagInput1)
    const { data: created, error } = await supabase
      .from('posts')
      .insert({
        type,
        content,
        caption: stripHtml(caption).length ? caption.trim() : null,
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
      if (newId) void classifyPostAfterSave(newId)
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
      const preview = await fetchLinkPreviewClient(url)
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
          const preview = await fetchLinkPreviewClient(articleUrl.trim())
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
          const preview = await fetchLinkPreviewClient(textSoleArticle)
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
    user?.id &&
      profile &&
      feedBootstrapped &&
      followingOtherCount !== null &&
      (followingOtherCount === 0 || !choseMainFeed),
  )
  const showSignedInPostFeed = Boolean(user?.id && profile && feedBootstrapped && !showPeopleDirectory)

  useEffect(() => {
    isOnboardingFeedRef.current = showPeopleDirectory
  }, [showPeopleDirectory])

  const avatarUrl =
    (profile?.avatar_url as string | undefined) || (user?.user_metadata?.avatar_url as string | undefined)
  const activeTypeButton = (type: ComposerType) => panel === type
  const textCount = stripHtml(textContent).length

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

      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-zinc-900">Things I Like</h1>
          {user ? (
            <UserNavMenu
              username={profile?.username ?? null}
              avatarUrl={avatarUrl}
              onSignOut={signOut}
              hasUnreadNotifications={notifUnread}
            />
          ) : (
            <button onClick={signInWithGoogle} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
              Sign in with Google
            </button>
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

        {!user ? (
          <div className="mb-10 rounded-md border border-zinc-200 bg-white p-6 text-center">
            <p className="mb-3 text-zinc-500">Sign in to start sharing things you like.</p>
            <button onClick={signInWithGoogle} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Sign in with Google</button>
          </div>
        ) : null}

        {user && profile ? (
          <>
          <section className="mb-10 overflow-hidden rounded-[4px] border border-[#dbdbdb] bg-white">
            <div className="flex items-center gap-3 px-3.5 py-3">
              {avatarUrl ? <img src={avatarUrl} alt="Your avatar" className="h-[34px] w-[34px] rounded-full border border-[#dbdbdb] object-cover" /> : <div className="h-[34px] w-[34px] rounded-full border border-[#dbdbdb] bg-zinc-100" />}
              <div className="text-sm text-[#8e8e8e]">{panel ? 'Choose a post type below' : 'Something you like today?'}</div>
            </div>

            <div className="border-t border-[#dbdbdb] px-3.5 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {(['image', 'video', 'link', 'text', 'quote', 'audio'] as ComposerType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPanel(panel === type ? null : type)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                      activeTypeButton(type) ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-[#dbdbdb] text-[#8e8e8e] hover:border-zinc-900 hover:text-zinc-900'
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
                      placeholder={panel === 'link' ? 'Add a note... why does this matter to you?' : 'Add a caption...'}
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
                  <button type="button" onClick={createPost} disabled={!canPost || loading || imageUploading} className="rounded-full bg-zinc-900 px-4.5 py-1.5 text-[13px] font-bold text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40">
                    {loading ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
          {showPeopleDirectory ? (
            <div className="mb-10">
              {followingOtherCount !== null && followingOtherCount > 0 ? (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => goToMainFeed()}
                    className="text-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                  >
                    Go to your feed →
                  </button>
                </div>
              ) : null}
              <h2 className="mb-3 text-lg font-semibold text-zinc-900">People Who Like Things</h2>
              <PeopleWhoLikeThingsDirectory
                currentUserId={user.id}
                refreshKey={directoryRefreshKey}
                onFollowChanged={() => void refetchFollowingCount()}
              />
            </div>
          ) : null}
          </>
        ) : null}

        <section className="space-y-6">
          {!user && posts.length > 0 ? (
            <h2 className="text-sm font-medium text-zinc-600">Latest posts</h2>
          ) : null}
          {user && profile && showSignedInPostFeed && posts.length === 0 ? (
            <p className="py-12 text-center text-zinc-400">No posts yet. Follow someone or share something you like.</p>
          ) : null}
          {!user && posts.length === 0 ? (
            <p className="py-12 text-center text-zinc-400">Nothing posted yet. Sign in to share something you like.</p>
          ) : null}
          {(!user || showSignedInPostFeed) &&
            posts.map((post) => {
            const author = post.user_id ? authorByUserId[post.user_id] : undefined
            return (
            <div key={post.id}>
              <PostCard
                post={post}
                isOwner={user?.id === post.user_id}
                authorUsername={author?.username ?? null}
                authorAvatarUrl={author?.avatar_url ?? null}
                showAuthor={!!author?.username}
                dashboardActions={!!user}
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
        </section>
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
