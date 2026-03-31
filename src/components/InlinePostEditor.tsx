'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ComposerModuleChips } from '@/src/components/ComposerModuleChips'
import { RichTextEditor } from '@/src/components/RichTextEditor'
import { syncPostUserModulesSelection } from '@/src/lib/modules-client'
import { classifyPostAfterSave, type ProfileModuleRow } from '@/src/lib/modules-ui'
import { fetchLinkPreviewClient } from '@/src/lib/link-preview-client'
import {
  isValidHttpUrl,
  linkPreviewHasVisual,
  normalizeLinkUrl,
  stripHtml,
  type Post,
} from '@/src/lib/post-helpers'
import { sanitizeRichHtml } from '@/src/lib/sanitize-rich-html'
import { parsePostTags, tagsFromComposerInputs } from '@/src/lib/post-tags'
import { supabase } from '@/src/lib/supabase'

type EditField = 'content' | 'caption'

export function InlinePostEditor({
  post,
  userId,
  onCancel,
  onSaved,
}: {
  post: Post
  userId: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
}) {
  const router = useRouter()
  const [editingContent, setEditingContent] = useState(post.content || '')
  const [editingCaption, setEditingCaption] = useState(post.caption || '')
  const [editingTag0, setEditingTag0] = useState('')
  const [editingTag1, setEditingTag1] = useState('')
  const [editingLoading, setEditingLoading] = useState(false)
  const [activeEditor, setActiveEditor] = useState<EditField | null>(null)
  const [formatState, setFormatState] = useState({ bold: false, italic: false })
  const editContentEditorRef = useRef<HTMLDivElement | null>(null)
  const editCaptionEditorRef = useRef<HTMLDivElement | null>(null)
  const [profileModules, setProfileModules] = useState<ProfileModuleRow[]>([])
  const [editorModuleIds, setEditorModuleIds] = useState<Set<string>>(() => new Set())
  const [modulesAiSuggest, setModulesAiSuggest] = useState(true)

  useEffect(() => {
    setEditingContent(post.content || '')
    setEditingCaption(post.caption || '')
    const t = parsePostTags(post.tags)
    setEditingTag0(t[0] ?? '')
    setEditingTag1(t[1] ?? '')
  }, [post.id, post.content, post.caption, post.tags])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [{ data: mods }, { data: pu }, { data: profRow }] = await Promise.all([
        supabase
          .from('profile_modules')
          .select('id, name, sort_order, is_active')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('post_modules_user').select('module_id').eq('post_id', post.id),
        supabase.from('profiles').select('modules_ai_enabled').eq('id', userId).maybeSingle(),
      ])
      if (cancelled) return
      setProfileModules((mods || []) as ProfileModuleRow[])
      setEditorModuleIds(new Set((pu || []).map((r) => r.module_id as string)))
      setModulesAiSuggest(profRow?.modules_ai_enabled !== false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, post.id])

  function syncRichTextFromActiveEditor() {
    if (!activeEditor) return
    if (activeEditor === 'content' && editContentEditorRef.current) {
      setEditingContent(editContentEditorRef.current.innerHTML)
    } else if (activeEditor === 'caption' && editCaptionEditorRef.current) {
      setEditingCaption(editCaptionEditorRef.current.innerHTML)
    }
  }

  function updateToolbarState(targetEditor: EditField | null) {
    const editorEl =
      targetEditor === 'content' ? editContentEditorRef.current : targetEditor === 'caption' ? editCaptionEditorRef.current : null
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

  useEffect(() => {
    const handleSelectionChange = () => updateToolbarState(activeEditor)
    document.addEventListener('selectionchange', handleSelectionChange)
    handleSelectionChange()
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [activeEditor])

  const saveEdit = useCallback(async () => {
    if (!userId) return
    setEditingLoading(true)
    const contentFromDom =
      post.type === 'text' || post.type === 'quote'
        ? (editContentEditorRef.current?.innerHTML ?? editingContent).trim()
        : editingContent.trim()
    const captionFromDom = (editCaptionEditorRef.current?.innerHTML ?? editingCaption).trim()
    const updates: {
      content: string
      caption: string | null
      metadata?: Record<string, unknown>
      tags: string[]
    } = {
      content:
        post.type === 'text' || post.type === 'quote' ? sanitizeRichHtml(contentFromDom) : contentFromDom,
      caption: stripHtml(captionFromDom).length ? sanitizeRichHtml(captionFromDom) : null,
      tags: tagsFromComposerInputs(editingTag0, editingTag1),
    }

    if (post.type === 'article' && isValidHttpUrl(updates.content)) {
      const preview = await fetchLinkPreviewClient(updates.content)
      if (preview && linkPreviewHasVisual(preview)) {
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
      .eq('user_id', userId)
      .select('id')

    if (error) {
      alert(`Could not update post: ${error.message}`)
    } else if (!data?.length) {
      alert(
        'Could not save your edit (no rows updated). This usually means Supabase Row Level Security is missing an UPDATE policy for the posts table. Run the SQL in supabase/policies-posts-update.sql in the Supabase SQL editor, then try again.',
      )
    } else {
      const syncErr = await syncPostUserModulesSelection(supabase, post.id, editorModuleIds)
      void classifyPostAfterSave(post.id)
      if (syncErr.error) {
        alert(`Post saved, but modules could not be updated: ${syncErr.error}`)
        await onSaved()
      } else {
        onCancel()
        await onSaved()
      }
    }
    setEditingLoading(false)
  }, [userId, post, editingContent, editingCaption, editingTag0, editingTag1, editorModuleIds, onCancel, onSaved])

  return (
    <div className="mb-6 mt-2 w-full rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3">
        <div className="mb-2 flex gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatActiveEditor('bold')}
            className={`h-7 w-7 rounded-[3px] text-xs hover:bg-zinc-100 hover:text-zinc-900 ${formatState.bold ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatActiveEditor('italic')}
            className={`h-7 w-7 rounded-[3px] text-xs italic hover:bg-zinc-100 hover:text-zinc-900 ${formatState.italic ? 'bg-zinc-100 text-zinc-900' : 'text-[#8e8e8e]'}`}
          >
            I
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatActiveEditor('createLink')}
            className="h-7 w-10 rounded-[3px] text-xs text-[#8e8e8e] hover:bg-zinc-100 hover:text-zinc-900"
          >
            Link
          </button>
        </div>
        {post.type === 'text' || post.type === 'quote' ? (
          <RichTextEditor
            value={editingContent}
            onChange={setEditingContent}
            onFocus={() => {
              setActiveEditor('content')
              updateToolbarState('content')
            }}
            placeholder="Edit post content..."
            className="mb-3 min-h-[90px] w-full rounded-md border border-zinc-200 p-2 text-sm text-zinc-800 focus:outline-none [&_a]:text-blue-600 [&_a]:underline"
            editorRef={editContentEditorRef}
            maxPlainTextLength={500}
            onProfilePathNavigate={(p) => router.push(p)}
          />
        ) : (
          <input
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            className="mb-3 w-full rounded-md border border-zinc-200 p-2 text-sm focus:outline-none"
          />
        )}
        <RichTextEditor
          value={editingCaption}
          onChange={setEditingCaption}
          onFocus={() => {
            setActiveEditor('caption')
            updateToolbarState('caption')
          }}
          placeholder="Edit caption..."
          className="min-h-[32px] w-full text-sm text-zinc-700 focus:outline-none [&_a]:text-blue-600 [&_a]:underline"
          editorRef={editCaptionEditorRef}
          onProfilePathNavigate={(p) => router.push(p)}
        />
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Tags (max 2)</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={editingTag0}
              onChange={(e) => setEditingTag0(e.target.value)}
              placeholder="first tag"
              maxLength={40}
              className="min-w-[8rem] flex-1 rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <input
              value={editingTag1}
              onChange={(e) => setEditingTag1(e.target.value)}
              placeholder="second tag"
              maxLength={40}
              className="min-w-[8rem] flex-1 rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>
        <ComposerModuleChips
          modules={profileModules}
          selectedIds={editorModuleIds}
          aiMaySuggestMore={modulesAiSuggest}
          onToggle={(id) =>
            setEditorModuleIds((prev) => {
              const n = new Set(prev)
              if (n.has(id)) n.delete(id)
              else n.add(id)
              return n
            })
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:text-zinc-900">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void saveEdit()}
          disabled={editingLoading}
          className="rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {editingLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
