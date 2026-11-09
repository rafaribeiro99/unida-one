import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

// Atualiza o app sozinho quando sai versão nova (verifica ao abrir e a cada 10 minutos)
const atualizar = registerSW({
  immediate: true,
  onNeedRefresh() { atualizar(true) },
  onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update(), 10 * 60 * 1000) },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
