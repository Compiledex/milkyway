import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import './index.css'
import App from './App.tsx'
import { applyBrand, brand } from './brand'
import { t, useLang, type StringKey } from './i18n'

applyBrand()
// The app name is localised (Milkyway / Melkeveien), so the tab title follows the language.
const syncDocument = () => {
  document.documentElement.lang = useLang.getState().lang
  document.title = brand.documentTitle.replace(brand.appName, t(`brand.${brand.id}.appName` as StringKey))
}
syncDocument()
useLang.subscribe(syncDocument)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
