import { ImageResponse } from 'next/og'

export const alt = 'Things I Like'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Default OG image for routes without a segment-specific image (home, profiles, etc.). */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#18181b',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            backgroundColor: '#27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 36,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
            <path
              d="M24 34 C24 34 12 27 12 19.5 C12 16 14.5 13 18 13 C20.5 13 22.5 14.5 24 16.5 C25.5 14.5 27.5 13 30 13 C33.5 13 36 16 36 19.5 C36 27 24 34 24 34 Z"
              fill="white"
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 300,
            color: '#fafafa',
            letterSpacing: '-0.03em',
          }}
        >
          Things I Like
        </div>
        <div style={{ marginTop: 16, fontSize: 28, color: '#a1a1aa' }}>Share things you like</div>
      </div>
    ),
    { ...size },
  )
}
