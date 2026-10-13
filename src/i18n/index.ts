import { create } from 'zustand'
import { en, ja, nb, type StringKey } from './strings'

export type Lang = 'nb' | 'en' | 'ja'
export type { StringKey } from './strings'

export const LANGUAGES: { code: Lang; short: string; name: string; locale: string }[] = [
  { code: 'nb', short: 'NO', name: 'Norsk', locale: 'nb-NO' },
  { code: 'en', short: 'EN', name: 'English', locale: 'en-GB' },
  { code: 'ja', short: 'JA', name: '日本語', locale: 'ja-JP' },
]

const dictionaries: Record<Lang, Record<StringKey, string>> = { nb, en, ja }
const STORAGE_KEY = 'waretrack.lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'nb' || saved === 'en' || saved === 'ja') return saved
  } catch {
    // Storage blocked: fall through to the default.
  }
  return 'en'
}

export const useLang = create<{ lang: Lang; setLang: (lang: Lang) => void }>()((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
    document.documentElement.lang = lang
    set({ lang })
  },
}))

export type Vars = Record<string, string | number>

/** Translate with the current language. Fine outside React; components should use `useT` so they re-render on change. */
export function t(key: StringKey, vars?: Vars): string {
  const text = dictionaries[useLang.getState().lang][key] ?? en[key] ?? key
  if (!vars) return text
  // {n} inserts a value; {n|one|many} picks a singular or plural word for it.
  return text.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_, name: string, one?: string, many?: string) =>
    one !== undefined ? (Number(vars[name]) === 1 ? one : many!) : String(vars[name] ?? `{${name}}`),
  )
}

/** Hook: returns `t` and re-renders the component when the language changes. */
export function useT() {
  useLang((s) => s.lang)
  return t
}

export function currentLocale() {
  const lang = useLang.getState().lang
  return LANGUAGES.find((l) => l.code === lang)!.locale
}
