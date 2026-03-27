/** Turn @username in HTML into profile links (skips @ when part of an email/word). */
export function linkifyAtMentionsInHtml(html: string): string {
  if (!html) return html
  return html.split(/(<[^>]+>)/g).map((segment, i) => {
    if (i % 2 === 1) return segment
    return segment.replace(/@([a-zA-Z0-9_]+)/g, (full, name: string, offset: number) => {
      const prev = offset > 0 ? segment[offset - 1] : ''
      if (/[A-Za-z0-9_]/.test(prev)) return full
      return `<a href="/${name}" class="text-blue-600 underline">${full}</a>`
    })
  }).join('')
}
