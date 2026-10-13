// Brand logos. Kept apart from the brand configs so React Fast Refresh works.

export const TINE_BLUE = '#003876'
/** Set to e.g. '/brand/tine-logo.svg' after placing the official file in public/brand/. */
const TINE_LOGO_URL: string | null = null

export function WareTrackLogo({ height = 30 }: { height?: number }) {
  return (
    <span className="logo-lockup">
      <svg width={height} height={height} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M16 6 25 11v10l-9 5-9-5V11z" fill="#fff" opacity=".95" />
        <path d="M16 16 25 11M16 16 7 11M16 16v10" stroke="var(--accent)" strokeWidth="1.4" />
      </svg>
      <span className="logo-word">WareTrack</span>
    </span>
  )
}

export function TineLogo({ height = 32 }: { height?: number }) {
  return (
    <span className="logo-lockup">
      {TINE_LOGO_URL ? (
        <img src={TINE_LOGO_URL} alt="TINE" height={height} />
      ) : (
        <svg height={height} viewBox="0 0 96 48" role="img" aria-label="TINE">
          <rect x="1" y="1" width="94" height="46" rx="23" fill={TINE_BLUE} />
          <text
            x="48"
            y="34"
            textAnchor="middle"
            fill="#ffffff"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="800"
            fontSize="26"
            letterSpacing="1.5"
          >
            TINE
          </text>
        </svg>
      )}
    </span>
  )
}

/** Milkyway app mark: a milk drop with a winding road through it. */
export const MILKYWAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a74e8"/><stop offset="1" stop-color="#0b3f91"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M32 9c8.5 10.2 14 18.2 14 25.5a14 14 0 0 1-28 0C18 27.2 23.5 19.2 32 9z" fill="#fff"/><path d="M25 46c4-3 9-3.5 10-8s-4-6-2-10 5-4 6-6" fill="none" stroke="#1556c4" stroke-width="4.2" stroke-linecap="round"/><path d="M25 46c4-3 9-3.5 10-8s-4-6-2-10 5-4 6-6" fill="none" stroke="#fff" stroke-width="1.1" stroke-dasharray="2.2 2.4" stroke-linecap="round"/></svg>`

export function MilkywayMark({ size = 32 }: { size?: number }) {
  return <span className="app-mark" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: MILKYWAY_ICON_SVG }} />
}
