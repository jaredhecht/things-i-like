'use client'

import { RefObject, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../src/lib/supabase'

type Post = {
  id: string
  type: string
  content: string | null
  caption: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user_id: string | null
}

type Profile = {
  id: string
  username: string
  display_name: string | null
}

type ComposerType = 'image' | 'video' | 'link' | 'text' | 'quote' | 'audio'
type LinkTab = 'article' | 'spotify' | 'youtube'
type EditorTarget = 'text' | 'caption' | 'editContent' | 'editCaption'
type LinkPreview = {
  url: string
  siteName: string
  title: string
  description: string
  image: string
}

function getSpotifyEmbedUrl(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/)
  return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0` : null
}

function getYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

function getHostnameLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    return hostname.split('.')[0] || hostname
  } catch {
    return 'link'
  }
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeLinkUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getLinkPreviewFromMetadata(metadata: Record<string, unknown> | null): LinkPreview | null {
  if (!metadata || typeof metadata !== 'object') return null
  const link = metadata.link_preview
  if (!link || typeof link !== 'object') return null
  const candidate = link as Record<string, unknown>
  return {
    url: typeof candidate.url === 'string' ? candidate.url : '',
    siteName: typeof candidate.siteName === 'string' ? candidate.siteName : '',
    title: typeof candidate.title === 'string' ? candidate.title : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    image: typeof candidate.image === 'string' ? candidate.image : '',
  }
}

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

function PostCard({ post }: { post: Post }) {
  const postDate = new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const quoteAuthor = typeof post.metadata?.author === 'string' ? post.metadata.author : ''
  const storedLinkPreview = getLinkPreviewFromMetadata(post.metadata)
  const [liveLinkPreview, setLiveLinkPreview] = useState<LinkPreview | null>(storedLinkPreview)
  const renderPrettyLinkCard = !!post.content && !!liveLinkPreview?.title

  useEffect(() => {
    if (post.type !== 'article' || !post.content || liveLinkPreview?.title || !isValidHttpUrl(post.content)) return
    const controller = new AbortController()
    const loadPreview = async () => {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(post.content || '')}`, { signal: controller.signal })
        if (!response.ok) return
        const data = await response.json()
        if (controller.signal.aborted) return
        setLiveLinkPreview({
          url: typeof data.url === 'string' ? data.url : post.content || '',
          siteName: typeof data.siteName === 'string' ? data.siteName : '',
          title: typeof data.title === 'string' ? data.title : '',
          description: typeof data.description === 'string' ? data.description : '',
          image: typeof data.image === 'string' ? data.image : '',
        })
      } catch {
        // Keep fallback rendering if preview request fails.
      }
    }
    void loadPreview()
    return () => controller.abort()
  }, [liveLinkPreview?.title, post.content, post.type])

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{post.type}</p>

      {post.type === 'youtube' && post.content ? (
        getYouTubeVideoId(post.content) ? (
          <div className="relative mb-4 w-full overflow-hidden rounded-md bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={`https://www.youtube.com/embed/${getYouTubeVideoId(post.content)}`}
              className="absolute left-0 top-0 h-full w-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-3 block break-all text-blue-600 hover:underline">
            {post.content}
          </a>
        )
      ) : null}

      {post.type === 'spotify' && post.content ? (
        getSpotifyEmbedUrl(post.content) ? (
          <iframe
            src={getSpotifyEmbedUrl(post.content) || ''}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="mb-4 rounded-md"
          />
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-3 block break-all text-blue-600 hover:underline">
            {post.content}
          </a>
        )
      ) : null}

      {post.type === 'soundcloud' && post.content ? (
        <iframe
          title="SoundCloud"
          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(post.content)}`}
          width="100%"
          height="120"
          className="mb-4 rounded-md"
        />
      ) : null}

      {post.type === 'image' && post.content ? (
        <a
          href={post.content}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 block overflow-hidden rounded-md bg-zinc-100"
        >
          <img
            src={post.content}
            alt="Post image"
            className="mx-auto max-h-[min(60vh,520px)] w-full object-contain"
          />
        </a>
      ) : null}

      {post.type === 'article' && post.content ? (
        renderPrettyLinkCard ? (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-4 block overflow-hidden rounded-md border border-zinc-200 hover:bg-zinc-50">
            {liveLinkPreview?.image ? <img src={liveLinkPreview.image} alt={liveLinkPreview.title} className="h-48 w-full object-cover" /> : null}
            <div className="p-4">
              <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{liveLinkPreview?.siteName || getHostnameLabel(post.content)}</p>
              <p className="mb-1 text-sm font-semibold text-zinc-900">{liveLinkPreview?.title}</p>
              {liveLinkPreview?.description ? <p className="line-clamp-2 text-sm text-zinc-500">{liveLinkPreview.description}</p> : null}
            </div>
          </a>
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-4 block rounded-md border border-zinc-200 p-4 hover:bg-zinc-50">
            <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{getHostnameLabel(post.content)}</p>
            <p className="break-all text-sm font-medium text-zinc-800">{post.content}</p>
          </a>
        )
      ) : null}

      {post.type === 'quote' && (
        <>
          <blockquote className="mb-2 text-xl font-light italic leading-relaxed text-zinc-900">&ldquo;{post.content}&rdquo;</blockquote>
          {quoteAuthor ? <p className="mb-3 text-sm italic text-zinc-500">- {quoteAuthor}</p> : null}
        </>
      )}

      {post.type === 'text' && post.content ? <div className="mb-2 leading-relaxed text-zinc-800 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: post.content }} /> : null}
      {!['youtube', 'spotify', 'soundcloud', 'image', 'article', 'quote', 'text'].includes(post.type) && post.content ? (
        <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-2 block break-all text-blue-600 hover:underline">
          {post.content}
        </a>
      ) : null}

      {post.caption ? <div className="mb-2 text-sm text-zinc-500 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: post.caption }} /> : null}
      <p className="text-xs text-zinc-300">{postDate}</p>
    </article>
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
  const textEditorRef = useRef<HTMLDivElement | null>(null)
  const captionEditorRef = useRef<HTMLDivElement | null>(null)
  const editContentEditorRef = useRef<HTMLDivElement | null>(null)
  const editCaptionEditorRef = useRef<HTMLDivElement | null>(null)

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

  async function fetchPosts() {
    const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
    if (error) console.error('Error fetching posts:', error)
    if (data) setPosts(data)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) loadProfile(user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) loadProfile(currentUser.id)
      if (!currentUser) {
        setProfile(null)
        setNeedsUsername(false)
      }
    })

    const loadInitialPosts = async () => {
      const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
      if (error) console.error('Error fetching posts:', error)
      if (data) setPosts(data)
    }
    void loadInitialPosts()
    return () => subscription.unsubscribe()
  }, [])

  function resetComposer() {
    setTextContent('')
    setQuoteContent('')
    setQuoteAuthor('')
    setImageUrl('')
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
    if (panel === 'image') return imageUrl.trim().length > 0
    if (panel === 'video') return videoUrl.trim().length > 0
    if (panel === 'audio') return audioUrl.trim().length > 0
    if (panel === 'link') {
      if (linkTab === 'article') return articleUrl.trim().length > 0
      if (linkTab === 'spotify') return spotifyUrl.trim().length > 0
      return youtubeUrl.trim().length > 0
    }
    return false
  }, [panel, textContent, quoteContent, imageUrl, videoUrl, audioUrl, linkTab, articleUrl, spotifyUrl, youtubeUrl])

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
      fetchPosts()
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
      await fetchPosts()
    }
    setEditingLoading(false)
  }

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const activeTypeButton = (type: ComposerType) => panel === type
  const textCount = stripHtml(textContent).length

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-tight text-zinc-900">Things I Like</h1>
          {user ? (
            <div className="flex items-center gap-3">
              {profile ? <span className="text-sm text-zinc-500">@{profile.username}</span> : null}
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
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                      activeTypeButton(type) ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-[#dbdbdb] text-[#8e8e8e] hover:border-zinc-900 hover:text-zinc-900'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {panel ? (
              <div className="border-t border-[#dbdbdb]">
                <div className="p-3.5">
                  {panel === 'image' ? (
                    <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste image URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" />
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
                  <button type="button" onClick={createPost} disabled={!canPost || loading} className="rounded-full bg-zinc-900 px-4.5 py-1.5 text-[13px] font-bold text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40">
                    {loading ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-6">
          {posts.length === 0 ? <p className="py-12 text-center text-zinc-400">No posts yet. Share something you like.</p> : null}
          {posts.map((post) => (
            <div key={post.id}>
              <PostCard post={post} />
              {user?.id === post.user_id ? (
                <div className="mb-6 mt-2 flex justify-end">
                  {editingPostId === post.id ? (
                    <div className="w-full rounded-md border border-zinc-200 bg-white p-4">
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
                        <button onClick={cancelEditing} className="text-sm text-zinc-500 hover:text-zinc-900">Cancel</button>
                        <button onClick={() => saveEdit(post)} disabled={editingLoading} className="rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-50">{editingLoading ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => startEditing(post)} className="text-xs text-zinc-500 hover:text-zinc-900">Edit post</button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
