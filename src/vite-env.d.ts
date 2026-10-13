/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WARETRACK_API_URL?: string
  readonly VITE_WARETRACK_API_TOKEN?: string
  readonly VITE_WARETRACK_POLL_MS?: string
  /** 'tine' (default) or 'waretrack' */
  readonly VITE_BRAND?: string
}
