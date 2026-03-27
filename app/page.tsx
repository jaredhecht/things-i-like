'use client'

import Link from 'next/link'
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ComposerTypeIcon } from '../src/components/ComposerTypeIcons'
import { PostCard } from '../src/components/PostCard'
import {
  getSpotifyEmbedUrl,
  getYouTubeVideoId,
  getHostnameLabel,
  isValidHttpUrl,
  normalizeLinkUrl,
  stripHtml,
  type LinkPreview,
  type Post,
} from '../src/lib/post-helpers'
import { fetchAllPostsForAuthorIds } from '../src/lib/posts-batched'
import { supabase } from '../src/lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
}

type AuthorMeta = {
  username: string
  display_name: string | null
}

type ComposerType = 'image' | 'video' | 'link' | 'text' | 'quote' | 'audio'
type LinkTab = 'article' | 'spotify' | 'youtube'
type EditorTarget = 'text' | 'caption' | 'editContent' | 'editCaption'

const POST_IMAGES_BUCKET = 'post-images'
const IMAGE_MAX_BYTES = 8 * 1024 * 1024

function RichTextEditor({
  value,
  onChange,
  onFocus,
  placeholder,
  className,
  editorRef,
  maxPlainTextLength,
}: {
  value: string
  onChange: (html: string) => void
  onFocus: () => void
  placeholder: string
  className: string
  editorRef: RefObject<HTMLDivElement | null>
  maxPlainTextLength?: number
}) {
  useEffect(() => {
    if (!editorRef.current) return
    const isFocused = document.activeElement === editorRef.current
    if (!isFocused && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [editorRef, value])

  return (
    <div className="relative">
      {stripHtml(value).length === 0 ? <div className="pointer-events-none absolute left-0 top-0 text-sm text-[#b8b8b8]">{placeholder}</div> : null}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={className}
        onFocus={onFocus}
        onClick={(e) => {
          const t = e.target as HTMLElement | null
          if (t?.closest('a')) {
            const a = t.closest('a') as HTMLAnchorElement
            const href = a.getAttribute('href')
            if (href) {
              e.preventDefault()
              try {
                const url = new URL(href, window.location.href)
                window.open(url.href, '_blank', 'noopener,noreferrer')
              } catch {
                window.open(normalizeLinkUrl(href), '_blank', 'noopener,noreferrer')
              }
            }
          }
        }}
        onInput={(e) => {
          const nextHtml = e.currentTarget.innerHTML
          if (maxPlainTextLength && stripHtml(nextHtml).length > maxPlainTextLength) {
            e.currentTarget.innerHTML = value
            return
          }
          onChange(nextHtml)
        }}
      />
    </div>
  )
}

export default function Home() {
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
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeEditor, setActiveEditor] = useState<EditorTarget | null>(null)
  const [formatState, setFormatState] = useState({ bold: false, italic: false })
  const [loading, setLoading] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editingPostType, setEditingPostType] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingCaption, setEditingCaption] = useState('')
  const [editingLoading, setEditingLoading] = useState(false)
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null)
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<Post | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [authorByUserId, setAuthorByUserId] = useState<Record<string, AuthorMeta>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())
  const [rethingSource, setRethingSource] = useState<Post | null>(null)
  const [rethingCaption, setRethingCaption] = useState('')
  const [rethingBusy, setRethingBusy] = useState(false)
  const textEditorRef = useRef<HTMLDivElement | null>(null)
  const captionEditorRef = useRef<HTMLDivElement | null>(null)
  const editContentEditorRef = useRef<HTMLDivElement | null>(null)
  const editCaptionEditorRef = useRef<HTMLDivElement | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)

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

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) {
      setProfile(data)
      setNeedsUsername(false)
    } else {
      setNeedsUsername(true)
    }
  }

  async function claimUsername(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !username.trim()) return
    setLoading(true)
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      username: username.trim().toLowerCase(),
      display_name: user.user_metadata?.full_name || username.trim(),
    })
    if (error) alert(error.code === '23505' ? 'That username is already taken. Try another one.' : `Error claiming username: ${error.message}`)
    else await loadProfile(user.id)
    setLoading(false)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const hydrateEngagement = useCallback(async (userId: string, list: Post[]) => {
    if (list.length === 0) {
      setLikeCounts({})
      setLikedPostIds(new Set())
      return
    }
    const ids = list.map((p) => p.id)
    const countByPost: Record<string, number> = {}
    const my = new Set<string>()
    const chunk = 500
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk)
      const { data: likesRows } = await supabase.from('post_likes').select('post_id, user_id').in('post_id', slice)
      for (const row of likesRows || []) {
        countByPost[row.post_id] = (countByPost[row.post_id] || 0) + 1
        if (row.user_id === userId) my.add(row.post_id)
      }
    }
    setLikeCounts(countByPost)
    setLikedPostIds(my)
  }, [])

  const loadPublicPreviewPosts = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) {
      console.error('Error loading public preview posts:', error)
      setPosts([])
      setAuthorByUserId({})
      return
    }
    const list = (rows || []) as Post[]
    const ids = [...new Set(list.map((p) => p.user_id).filter(Boolean))] as string[]
    if (ids.length === 0) {
      setPosts(list)
      setAuthorByUserId({})
      return
    }
    const { data: profs } = await supabase.from('profiles').select('id, username, display_name').in('id', ids)
    const map: Record<string, AuthorMeta> = {}
    for (const p of profs || []) {
      map[p.id] = { username: p.username, display_name: p.display_name }
    }
    setPosts(list)
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
        list = await fetchAllPostsForAuthorIds(supabase, authorIds)
      } catch (error) {
        console.error('Error fetching feed:', error)
      }
      const { data: profs } = await supabase.from('profiles').select('id, username, display_name').in('id', authorIds)
      const map: Record<string, AuthorMeta> = {}
      for (const p of profs || []) {
        map[p.id] = { username: p.username, display_name: p.display_name }
      }
      setAuthorByUserId(map)
      setPosts(list)
      await hydrateEngagement(userId, list)
    },
    [hydrateEngagement],
  )

  async function fetchFeed() {
    const {
      data: { user: u },
    } = await supabase.auth.getUser()
    if (!u) return
    await fetchFeedForUser(u.id)
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
    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      type: rethingSource.type,
      content: rethingSource.content,
      caption: stripHtml(rethingCaption).length ? rethingCaption.trim() : null,
      metadata,
      rething_of_post_id: rethingSource.id,
      rething_from_username: origAuthor,
    })
    if (error) alert(`Could not rething: ${error.message}`)
    else {
      setRethingSource(null)
      setRethingCaption('')
      await fetchFeed()
    }
    setRethingBusy(false)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) loadProfile(user.id)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) loadProfile(currentUser.id)
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
      void loadPublicPreviewPosts()
      return
    }
    void fetchFeedForUser(user.id)
  }, [user?.id, fetchFeedForUser, loadPublicPreviewPosts])

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
    setPanel(null)
    setActiveEditor(null)
    setLinkPreview(null)
  }

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
    else if (activeEditor === 'editContent' && editContentEditorRef.current) setEditingContent(editContentEditorRef.current.innerHTML)
    else if (activeEditor === 'editCaption' && editCaptionEditorRef.current) setEditingCaption(editCaptionEditorRef.current.innerHTML)
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
      targetEditor === 'text'
        ? textEditorRef.current
        : targetEditor === 'caption'
          ? captionEditorRef.current
          : targetEditor === 'editContent'
            ? editContentEditorRef.current
            : targetEditor === 'editCaption'
              ? editCaptionEditorRef.current
              : null
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
      type = 'text'
      content = textContent.trim()
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
      if (audioUrl.includes('soundcloud.com')) type = 'soundcloud'
      else if (audioUrl.includes('open.spotify.com')) type = 'spotify'
      else type = 'audio'
      content = audioUrl.trim()
    } else if (panel === 'link') {
      if (linkTab === 'article') {
        type = 'article'
        content = articleUrl.trim()
      } else if (linkTab === 'spotify') {
        type = 'spotify'
        content = spotifyUrl.trim()
      } else {
        type = 'youtube'
        content = youtubeUrl.trim()
      }
    }

    if (isValidHttpUrl(content) && !metadata.link_preview) {
      const preview = await fetchLinkPreview(content)
      if (preview?.title) metadata.link_preview = preview
    }

    const { error } = await supabase.from('posts').insert({
      type,
      content,
      caption: stripHtml(caption).length ? caption.trim() : null,
      user_id: user.id,
      metadata,
    })

    if (error) alert(`Error creating post: ${error.message}`)
    else {
      resetComposer()
      fetchFeed()
    }
    setLoading(false)
  }

  async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
    if (!isValidHttpUrl(url)) return null
    try {
      setPreviewLoading(true)
      const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      if (!response.ok) return null
      const data = await response.json()
      const preview: LinkPreview = {
        url: typeof data.url === 'string' ? data.url : url,
        siteName: typeof data.siteName === 'string' ? data.siteName : '',
        title: typeof data.title === 'string' ? data.title : '',
        description: typeof data.description === 'string' ? data.description : '',
        image: typeof data.image === 'string' ? data.image : '',
      }
      setLinkPreview(preview)
      return preview
    } catch {
      return null
    } finally {
      setPreviewLoading(false)
    }
  }

  async function startEditing(post: Post) {
    setEditingPostId(post.id)
    setEditingPostType(post.type)
    setEditingContent(post.content || '')
    setEditingCaption(post.caption || '')
  }

  function cancelEditing() {
    setEditingPostId(null)
    setEditingPostType(null)
    setEditingContent('')
    setEditingCaption('')
  }

  async function saveEdit(post: Post) {
    if (!editingPostId || !user?.id) return
    setEditingLoading(true)
    const contentFromDom =
      editingPostType === 'text' || editingPostType === 'quote'
        ? (editContentEditorRef.current?.innerHTML ?? editingContent).trim()
        : editingContent.trim()
    const captionFromDom = (editCaptionEditorRef.current?.innerHTML ?? editingCaption).trim()
    const updates: { content: string; caption: string | null; metadata?: Record<string, unknown> } = {
      content: contentFromDom,
      caption: stripHtml(captionFromDom).length ? captionFromDom : null,
    }

    if (post.type === 'article' && isValidHttpUrl(updates.content)) {
      const preview = await fetchLinkPreview(updates.content)
      if (preview?.title) {
        updates.metadata = {
          ...(post.metadata || {}),
          link_preview: preview,
        }
      }
    }

    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', post.id)
      .eq('user_id', user.id)
      .select('id')

    if (error) {
      alert(`Could not update post: ${error.message}`)
    } else if (!data?.length) {
      alert(
        'Could not save your edit (no rows updated). This usually means Supabase Row Level Security is missing an UPDATE policy for the posts table. Run the SQL in supabase/policies-posts-update.sql in the Supabase SQL editor, then try again.',
      )
    } else {
      cancelEditing()
      await fetchFeed()
    }
    setEditingLoading(false)
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

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
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
            <div className="flex items-center gap-3">
              {profile ? (
                <Link href={`/${profile.username}`} className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
                  @{profile.username}
                </Link>
              ) : null}
              <button onClick={signOut} className="text-sm text-zinc-400 hover:text-zinc-700">Sign out</button>
            </div>
          ) : (
            <button onClick={signInWithGoogle} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Sign in with Google</button>
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
                    <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Paste video URL (YouTube or direct link)..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" />
                  ) : null}

                  {panel === 'audio' ? (
                    <input type="url" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="Paste Spotify or SoundCloud URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" />
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
                      />
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
                            <input type="url" value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="Paste article URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" />
                            <button
                              type="button"
                              onClick={() => fetchLinkPreview(articleUrl)}
                              disabled={!isValidHttpUrl(articleUrl) || previewLoading}
                              className="rounded-[4px] border border-[#dbdbdb] px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-50"
                            >
                              {previewLoading ? 'Fetching...' : 'Fetch'}
                            </button>
                          </div>
                          {linkPreview?.title ? (
                            <div className="mt-3 overflow-hidden rounded-md border border-zinc-200">
                              {linkPreview.image ? <img src={linkPreview.image} alt={linkPreview.title} className="h-36 w-full object-cover" /> : null}
                              <div className="p-3">
                                <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">{linkPreview.siteName || getHostnameLabel(articleUrl)}</p>
                                <p className="text-sm font-semibold text-zinc-900">{linkPreview.title}</p>
                                {linkPreview.description ? <p className="line-clamp-2 text-xs text-zinc-500">{linkPreview.description}</p> : null}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      {linkTab === 'spotify' ? <input type="url" value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)} placeholder="Paste Spotify URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" /> : null}
                      {linkTab === 'youtube' ? <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="Paste YouTube URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" /> : null}
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
                    />
                  </div>
                ) : null}

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
        ) : null}

        <section className="space-y-6">
          {!user && posts.length > 0 ? (
            <h2 className="text-sm font-medium text-zinc-600">Latest posts</h2>
          ) : null}
          {user && posts.length === 0 ? (
            <p className="py-12 text-center text-zinc-400">No posts yet. Follow someone or share something you like.</p>
          ) : null}
          {!user && posts.length === 0 ? (
            <p className="py-12 text-center text-zinc-400">Nothing posted yet. Sign in to share something you like.</p>
          ) : null}
          {posts.map((post) => {
            const author = post.user_id ? authorByUserId[post.user_id] : undefined
            return (
            <div key={post.id}>
              <PostCard
                post={post}
                isOwner={user?.id === post.user_id}
                authorUsername={author?.username ?? null}
                authorDisplayName={author?.display_name ?? null}
                showAuthor={!!author?.username}
                dashboardActions={!!user}
                likeCount={likeCounts[post.id] ?? 0}
                liked={likedPostIds.has(post.id)}
                onLike={user?.id && post.user_id !== user.id ? () => void toggleLike(post.id) : undefined}
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
              />
              {user?.id === post.user_id && editingPostId === post.id ? (
                <div className="mb-6 mt-2 w-full rounded-md border border-zinc-200 bg-white p-4">
                  <div className="mb-3">
                    <div className="mb-2 flex gap-1">
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('bold')} className={`h-7 w-7 rounded-[3px] text-xs hover:bg-zinc-100 hover:text-zinc-900 ${formatState.bold ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}><strong>B</strong></button>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('italic')} className={`h-7 w-7 rounded-[3px] text-xs italic hover:bg-zinc-100 hover:text-zinc-900 ${formatState.italic ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}>I</button>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatActiveEditor('createLink')} className="h-7 w-10 rounded-[3px] text-xs text-[#8e8e8e] hover:bg-zinc-100 hover:text-zinc-900">Link</button>
                    </div>
                    {editingPostType === 'text' || editingPostType === 'quote' ? (
                      <RichTextEditor
                        value={editingContent}
                        onChange={setEditingContent}
                        onFocus={() => {
                          setActiveEditor('editContent')
                          updateToolbarState('editContent')
                        }}
                        placeholder="Edit post content..."
                        className="mb-3 min-h-[90px] w-full rounded-md border border-zinc-200 p-2 text-sm text-zinc-800 focus:outline-none [&_a]:text-blue-600 [&_a]:underline"
                        editorRef={editContentEditorRef}
                        maxPlainTextLength={500}
                      />
                    ) : (
                      <input value={editingContent} onChange={(e) => setEditingContent(e.target.value)} className="mb-3 w-full rounded-md border border-zinc-200 p-2 text-sm focus:outline-none" />
                    )}
                    <RichTextEditor
                      value={editingCaption}
                      onChange={setEditingCaption}
                      onFocus={() => {
                        setActiveEditor('editCaption')
                        updateToolbarState('editCaption')
                      }}
                      placeholder="Edit caption..."
                      className="min-h-[32px] w-full text-sm text-zinc-700 focus:outline-none [&_a]:text-blue-600 [&_a]:underline"
                      editorRef={editCaptionEditorRef}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={cancelEditing} className="text-sm text-zinc-500 hover:text-zinc-900">Cancel</button>
                    <button type="button" onClick={() => void saveEdit(post)} disabled={editingLoading} className="rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-50">{editingLoading ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              ) : null}
            </div>
            )
          })}
        </section>
      </div>
    </main>
  )
}
