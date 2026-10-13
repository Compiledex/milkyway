import type { SVGProps } from 'react'

// Small stroke icon set (24×24, 1.8px stroke) in the style of Lucide.

const paths = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  truck: 'M2 6h12v10H2zM14 9h4l4 4v3h-8zM6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rotateLeft: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  rotateRight: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  home: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
  close: 'M6 6l12 12M18 6 6 18',
  focus: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  forklift: 'M4 18V8h6l2 5v5zM12 13h2M16 4v14h5M16 16h5M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  door: 'M4 21V5l8-2 8 2v16M8 21V9h8v12M8 13h8M8 17h8',
  thermometer: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v7',
  check: 'm5 12 5 5 9-10',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17v.5',
  pallet: 'M3 18h18M5 18v2M12 18v2M19 18v2M5 9h6v9H5zM13 12h6v6h-6z',
  package: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7.5 5l9 4',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  store: 'M4 9h16v11H4zM3 9l2-5h14l2 5M9 20v-6h6v6',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.8 3.7 5.8 3.7 9s-1.2 6.2-3.7 9c-2.5-2.8-3.7-5.8-3.7-9S9.5 5.8 12 3z',
  milk: 'M8 3h8v3l2 3v12H6V9l2-3zM6 9h12M10 13h4',
  cream: 'M10 3h4v3l2.5 3v12h-9V9L10 6zM7.5 13h9',
  yogurt: 'M5 8h14l-1.6 12H6.6zM4 8h16M9 4.5h6V8',
  cheese: 'M3 17 12 5l9 12zM3 17v3h18v-3M9 14h.01M14 11h.01M15 15h.01',
  butter: 'M3 11h18v7H3zM6 11V8h12v3',
  juice: 'M7 5h10l-1.5 15h-7zM7.5 10h9M14 2l-2 5',
  spray: 'M9 10h6v11H9zM10 10V7h4l3-2M10 7H8',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  leaf: 'M5 19c0-8.5 6-14 14.5-14C19.5 13.5 14 19 5.5 19M5.5 19 13 11.5',
  cup: 'M5 9h11v4.5a5.5 5.5 0 0 1-11 0zM16 10.5h1.6a2.4 2.4 0 0 1 0 4.8H16',
  basket: 'M4 10h16l-1.8 8.5a2 2 0 0 1-2 1.5H7.8a2 2 0 0 1-2-1.5zM8.5 10 12 4.5 15.5 10',
  arrowIn: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15L19 12z',
  fast: 'M3.5 6v12l8-6zM12.5 6v12l8-6z',
  follow: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  arrowOut: 'M12 21V9M7 14l5-5 5 5M4 4h16',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  )
}
