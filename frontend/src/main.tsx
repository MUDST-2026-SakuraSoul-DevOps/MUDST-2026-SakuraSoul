import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// ฟอนต์ถูกรวมเข้า build (woff2 อยู่ใน dist) ไม่ต้องเรียก Google Fonts ตอนรัน ดูเหตุผลใน index.css
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('No #root element found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
