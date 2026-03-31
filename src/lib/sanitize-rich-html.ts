import sanitizeHtml from 'sanitize-html'

/** Tags/content the rich text editor can produce; everything else is stripped (XSS mitigation). */
const RICH_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'del',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'div',
    'span',
  ],
  allowedAttributes: {
    a: ['href'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
  },
  allowProtocolRelative: false,
}

/**
 * Sanitize HTML before persisting post body or caption.
 * Relative profile links like `/username` are preserved (sanitize-html allows relative hrefs).
 */
export function sanitizeRichHtml(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) return ''
  return sanitizeHtml(trimmed, RICH_HTML_OPTIONS)
}
