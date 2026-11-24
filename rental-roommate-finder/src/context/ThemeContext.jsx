import { createContext, useContext, useState, useEffect } from 'react'
import { getTheme, setTheme as persistTheme } from '../utils/theme'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => getTheme() === 'dark')

  useEffect(() => {
    persistTheme(isDark ? 'dark' : 'light')
  }, [isDark])

  // Sync when another tab changes theme for the SAME user
  useEffect(() => {
    function onStorage(e) {
      try {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}')
        const id = user.id || user._id || 'guest'
        if (e.key === `theme-${id}`) {
          setIsDark(e.newValue === 'dark')
        }
      } catch {}
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Apply on first render
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [])

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)