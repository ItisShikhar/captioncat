import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { PROJECT_BRANDING, PROJECT_BRANDING_LOGO_URL } from './project-branding'
import '@/engine-adapters/bundled-fonts'

document.title = `${PROJECT_BRANDING.projectName} Preset Studio`
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (favicon) favicon.href = PROJECT_BRANDING_LOGO_URL

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
