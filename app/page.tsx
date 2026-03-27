'use client'

import { useEffect, useMemo, useState } from 'react'
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

function PostCard({ post }: { post: Post }) {
  const postDate = new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const quoteAuthor = typeof post.metadata?.author === 'string' ? post.metadata.author : ''

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
        <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-4 block">
          <img src={post.content} alt="Post image" className="h-auto w-full rounded-md object-cover" />
        </a>
      ) : null}

      {post.type === 'article' && post.content ? (
        <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-4 block rounded-md border border-zinc-200 p-4 hover:bg-zinc-50">
          <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{getHostnameLabel(post.content)}</p>
          <p className="break-all text-sm font-medium text-zinc-800">{post.content}</p>
        </a>
      ) : null}

      {post.type === 'quote' && (
        <>
          <blockquote className="mb-2 text-xl font-light italic leading-relaxed text-zinc-900">&ldquo;{post.content}&rdquo;</blockquote>
          {quoteAuthor ? <p className="mb-3 text-sm italic text-zinc-500">- {quoteAuthor}</p> : null}
        </>
      )}

      {post.type === 'text' && post.content ? <p className="mb-2 whitespace-pre-wrap leading-relaxed text-zinc-800">{post.content}</p> : null}
      {!['youtube', 'spotify', 'soundcloud', 'image', 'article', 'quote', 'text'].includes(post.type) && post.content ? (
        <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-2 block break-all text-blue-600 hover:underline">
          {post.content}
        </a>
      ) : null}

      {post.caption ? <p className="mb-2 text-sm italic text-zinc-500">{post.caption}</p> : null}
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
  const [loading, setLoading] = useState(false)

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
  }

  const canPost = useMemo(() => {
    if (!panel) return false
    if (panel === 'text') return textContent.trim().length > 0
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

    const { error } = await supabase.from('posts').insert({
      type,
      content,
      caption: caption.trim() || null,
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

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const activeTypeButton = (type: ComposerType) => panel === type

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
                    <textarea value={textContent} onChange={(e) => setTextContent(e.target.value.slice(0, 500))} placeholder="What's on your mind?" className="min-h-[110px] w-full resize-y text-sm leading-relaxed text-zinc-900 placeholder:text-[#b8b8b8] focus:outline-none" />
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
                      {linkTab === 'article' ? <input type="url" value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="Paste article URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" /> : null}
                      {linkTab === 'spotify' ? <input type="url" value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)} placeholder="Paste Spotify URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" /> : null}
                      {linkTab === 'youtube' ? <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="Paste YouTube URL..." className="w-full rounded-[4px] border border-[#dbdbdb] px-3 py-2.5 text-sm text-zinc-900 placeholder:text-[#b8b8b8] focus:border-[#a0a0a0] focus:outline-none" /> : null}
                    </>
                  ) : null}
                </div>

                <div className="border-t border-[#dbdbdb] px-3.5 py-2.5">
                  <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={panel === 'link' ? 'Add a note... why does this matter to you?' : 'Add a caption...'} className="w-full text-sm text-zinc-700 placeholder:text-[#b8b8b8] focus:outline-none" />
                </div>

                <div className="flex items-center gap-2 border-t border-[#dbdbdb] px-3.5 py-2.5">
                  <p className={`mr-auto text-[11px] ${panel === 'text' && textContent.length > 450 ? 'text-red-400' : 'text-[#b8b8b8]'}`}>
                    {panel === 'text' ? `${textContent.length} / 500` : ''}
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
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </section>
      </div>
    </main>
  )
}
