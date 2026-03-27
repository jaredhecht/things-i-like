'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../src/lib/supabase'
import type { User } from '@supabase/supabase-js'

type Post = {
  id: string
  type: string
  content: string | null
  caption: string | null
  metadata: Record<string, unknown>
  created_at: string
  user_id: string | null
}

type Profile = {
  id: string
  username: string
  display_name: string | null
}

function getSpotifyEmbedUrl(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/)
  if (match) {
    const [, type, id] = match
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
  }
  return null
}

function getYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

function PostCard({ post }: { post: Post }) {
  if (post.type === 'spotify' && post.content) {
    const embedUrl = getSpotifyEmbedUrl(post.content)
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-3 block">spotify</span>
        {embedUrl ? (
          <iframe src={embedUrl} width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" className="rounded-xl" />
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{post.content}</a>
        )}
        {post.caption && <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>}
        <p className="mt-3 text-xs text-gray-300">{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    )
  }

  if (post.type === 'youtube' && post.content) {
    const videoId = getYouTubeVideoId(post.content)
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-3 block">youtube</span>
        {videoId ? (
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe src={`https://www.youtube.com/embed/${videoId}`} className="absolute top-0 left-0 w-full h-full rounded-xl" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{post.content}</a>
        )}
        {post.caption && <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>}
        <p className="mt-3 text-xs text-gray-300">{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    )
  }

  if (post.type === 'quote') {
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-2 block">quote</span>
        <blockquote className="text-xl font-light italic text-gray-800 leading-relaxed">&ldquo;{post.content}&rdquo;</blockquote>
        {post.caption && <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>}
        <p className="mt-3 text-xs text-gray-300">{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    )
  }

  if (post.type === 'text') {
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-2 block">text</span>
        <p className="text-gray-800 leading-relaxed">{post.content}</p>
        {post.caption && <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>}
        <p className="mt-3 text-xs text-gray-300">{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-100 rounded-lg p-5">
      <span className="text-xs uppercase tracking-wider text-gray-400 mb-2 block">{post.type}</span>
      <a href={post.content || '#'} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{post.content}</a>
      {post.caption && <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>}
      <p className="mt-3 text-xs text-gray-300">{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
    </div>
  )
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [username, setUsername] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [postType, setPostType] = useState<string>('text')
  const [content, setContent] = useState('')
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) loadProfile(user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) loadProfile(currentUser.id)
      else {
        setProfile(null)
        setNeedsUsername(false)
      }
    })

    fetchPosts()
    return () => subscription.unsubscribe()
  }, [])

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

    if (error) {
      if (error.code === '23505') {
        alert('That username is already taken. Try another one.')
      } else {
        alert('Error claiming username: ' + error.message)
      }
    } else {
      await loadProfile(user.id)
    }
    setLoading(false)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function fetchPosts() {
    const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
    if (data) setPosts(data)
    if (error) console.error('Error fetching posts:', error)
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true)

    const { error } = await supabase.from('posts').insert({
      type: postType,
      content,
      caption: caption || null,
      user_id: user.id,
    })

    if (error) {
      console.error('Error creating post:', error)
      alert('Error creating post: ' + error.message)
    } else {
      setContent('')
      setCaption('')
      fetchPosts()
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-light tracking-tight text-gray-900">Things I Like</h1>
          {user ? (
            <div className="flex items-center gap-3">
              {profile && (
                <span className="text-sm text-gray-500">@{profile.username}</span>
              )}
              <button onClick={signOut} className="text-sm text-gray-400 hover:text-gray-600">Sign out</button>
            </div>
          ) : (
            <button onClick={signInWithGoogle} className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </button>
          )}
        </div>

        {/* Username claiming */}
        {user && needsUsername && (
          <form onSubmit={claimUsername} className="mb-8 border border-blue-200 bg-blue-50 rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Choose your username</h2>
            <p className="text-sm text-gray-500 mb-4">This will be your public URL: thingsilike.app/<strong>{username || '...'}</strong></p>
            <div className="flex gap-2">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="username"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
              <button type="submit" disabled={!username.trim() || loading} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-40">
                {loading ? 'Claiming...' : 'Claim'}
              </button>
            </div>
          </form>
        )}

        {/* Composer — only show if signed in and has username */}
        {user && profile && (
          <form onSubmit={createPost} className="mb-12 border border-gray-200 rounded-lg p-6">
            <div className="flex gap-2 mb-4 flex-wrap">
              {['text', 'quote', 'youtube', 'spotify', 'soundcloud', 'article'].map((type) => (
                <button key={type} type="button" onClick={() => setPostType(type)} className={`px-3 py-1 rounded-full text-sm capitalize ${postType === type ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {type}
                </button>
              ))}
            </div>
            <input type="text" value={content} onChange={(e) => setContent(e.target.value)} placeholder={postType === 'text' ? "What's on your mind?" : postType === 'quote' ? 'Enter a quote...' : 'Paste a link...'} className="w-full border-b border-gray-200 pb-3 mb-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400" />
            <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a note (optional)" className="w-full border-b border-gray-200 pb-3 mb-4 text-sm text-gray-600 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
            <button type="submit" disabled={!content || loading} className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? 'Posting...' : 'Post'}
            </button>
          </form>
        )}

        {/* Sign in prompt if not logged in */}
        {!user && (
          <div className="mb-12 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-500 mb-3">Sign in to start sharing things you like</p>
            <button onClick={signInWithGoogle} className="inline-flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </button>
          </div>
        )}

        {/* Feed */}
        <div className="space-y-6">
          {posts.length === 0 && (
            <p className="text-gray-400 text-center py-12">No posts yet. Share something you like.</p>
          )}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </main>
  )
}
