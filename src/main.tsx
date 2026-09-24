import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'virtual:fonts'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage, watchForUpdates } from '@/lib/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// No-ops inside the claude.ai artifact, which has neither.
void requestPersistentStorage()
watchForUpdates()
