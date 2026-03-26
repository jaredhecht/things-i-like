'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../src/lib/supabase'

type Post = {
  id: string
  type: string
  content: string | null
  caption: string | null
  metadata: Record<string, unknown>
  created_at: string
}

function getSpotifyEmbedUrl(url: string): string | null {
  // Handles URLs like:
  // https://open.spotify.com/track/055T1TvSjL24CTUfTHSZs7?si=...
  // https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy
  // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/)
  if (match) {
    const [, type, id] = match
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
  }
  return null
}

function getYouTubeVideoId(url: string): string | null {
  // Handles URLs like:
  // https://www.youtube.com/watch?v=dQw4w9WgXcQ
  // https://youtu.be/dQw4w9WgXcQ
  // https://www.youtube.com/embed/dQw4w9WgXcQ
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

function PostCard({ post }: { post: Post }) {
  if (post.type === 'spotify' && post.content) {
    const embedUrl = getSpotifyEmbedUrl(post.content)
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-3 block">
          spotify
        </span>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="rounded-xl"
          />
        ) : (
          <a
            href={post.content}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {post.content}
          </a>
        )}
        {post.caption && (
          <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>
        )}
        <p className="mt-3 text-xs text-gray-300">
          {new Date(post.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    )
  }

if (post.type === 'youtube' && post.content) {
    const videoId = getYouTubeVideoId(post.content)
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-3 block">
          youtube
        </span>
        {videoId ? (
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              className="absolute top-0 left-0 w-full h-full rounded-xl"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <a
            href={post.content}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {post.content}
          </a>
        )}
        {post.caption && (
          <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>
        )}
        <p className="mt-3 text-xs text-gray-300">
          {new Date(post.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    )
  }

  if (post.type === 'quote') {
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-2 block">
          quote
        </span>
        <blockquote className="text-xl font-light italic text-gray-800 leading-relaxed">
          &ldquo;{post.content}&rdquo;
        </blockquote>
        {post.caption && (
          <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>
        )}
        <p className="mt-3 text-xs text-gray-300">
          {new Date(post.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    )
  }

  if (post.type === 'text') {
    return (
      <div className="border border-gray-100 rounded-lg p-5">
        <span className="text-xs uppercase tracking-wider text-gray-400 mb-2 block">
          text
        </span>
        <p className="text-gray-800 leading-relaxed">{post.content}</p>
        {post.caption && (
          <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>
        )}
        <p className="mt-3 text-xs text-gray-300">
          {new Date(post.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    )
  }

  // Default: link posts (youtube, soundcloud, article, etc.)
  return (
    <div className="border border-gray-100 rounded-lg p-5">
      <span className="text-xs uppercase tracking-wider text-gray-400 mb-2 block">
        {post.type}
      </span>
      <a
        href={post.content || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline break-all"
      >
        {post.content}
      </a>
      {post.caption && (
        <p className="mt-3 text-sm text-gray-500 italic">{post.caption}</p>
      )}
      <p className="mt-3 text-xs text-gray-300">
        {new Date(post.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
    </div>
  )
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [postType, setPostType] = useState<string>('text')
  const [content, setContent] = useState('')
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPosts()
  }, [])

  async function fetchPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setPosts(data)
    if (error) console.error('Error fetching posts:', error)
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.from('posts').insert({
      type: postType,
      content,
      caption: caption || null,
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
        <h1 className="text-3xl font-light tracking-tight text-gray-900 mb-8">
          Things I Like
        </h1>

        {/* Composer */}
        <form onSubmit={createPost} className="mb-12 border border-gray-200 rounded-lg p-6">
          <div className="flex gap-2 mb-4 flex-wrap">
            {['text', 'quote', 'youtube', 'spotify', 'soundcloud', 'article'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPostType(type)}
                className={`px-3 py-1 rounded-full text-sm capitalize ${
                  postType === type
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              postType === 'text' ? 'What\'s on your mind?' :
              postType === 'quote' ? 'Enter a quote...' :
              'Paste a link...'
            }
            className="w-full border-b border-gray-200 pb-3 mb-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
          />

          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a note (optional)"
            className="w-full border-b border-gray-200 pb-3 mb-4 text-sm text-gray-600 placeholder-gray-300 focus:outline-none focus:border-gray-400"
          />

          <button
            type="submit"
            disabled={!content || loading}
            className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Posting...' : 'Post'}
          </button>
        </form>

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