type ComposerType = 'image' | 'video' | 'link' | 'text' | 'quote' | 'audio'

const iconClass = 'h-5 w-5 shrink-0'

export function ComposerTypeIcon({ type }: { type: ComposerType }) {
  switch (type) {
    case 'image':
      return (
        <svg viewBox="0 0 40 40" fill="none" className={iconClass} aria-hidden>
          <rect x="4" y="4" width="32" height="32" rx="5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="13" cy="14" r="3" fill="currentColor" />
          <path d="M4 27l9-9 6 6 5-5L36 28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'video':
      return (
        <svg viewBox="0 0 40 40" fill="none" className={iconClass} aria-hidden>
          <rect x="3" y="10" width="24" height="20" rx="4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M27 16l10-5v18l-10-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'link':
      return (
        <svg viewBox="0 0 40 40" fill="none" className={iconClass} aria-hidden>
          <path
            d="M15 20 C15 16 11 12 7 12 C3 12 3 28 7 28 C11 28 15 24 15 20 Z"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M25 20 C25 24 29 28 33 28 C37 28 37 12 33 12 C29 12 25 16 25 20 Z"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="15" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )
    case 'text':
      return (
        <svg viewBox="0 0 40 40" fill="none" className={iconClass} aria-hidden>
          <line x1="7" y1="11" x2="33" y2="11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="7" y1="19" x2="33" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="7" y1="27" x2="22" y2="27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )
    case 'quote':
      return (
        <svg viewBox="0 0 40 40" fill="none" className={iconClass} aria-hidden>
          <path d="M7 29V22C7 15 11 11 15 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 29V22C21 15 25 11 29 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 29 Q11 32 15 29" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M21 29 Q25 32 29 29" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'audio':
      return (
        <svg viewBox="0 0 40 40" fill="none" className={iconClass} aria-hidden>
          <path d="M8 22 C8 13 13 7 20 7 C27 7 32 13 32 22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="4" y="22" width="8" height="10" rx="3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="28" y="22" width="8" height="10" rx="3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return null
  }
}
