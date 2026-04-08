import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type CursorStyle = 'default' | 'neon' | 'cosmic' | 'minimal'

interface ThemeState {
  mode: ThemeMode
  cursor: CursorStyle
}

function getStored<T extends string>(key: string, fallback: T, valid: T[]): T {
  try {
    const stored = localStorage.getItem(key) as T
    return stored && valid.includes(stored) ? stored : fallback
  } catch { return fallback }
}

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'auto']
const CURSOR_STYLES: CursorStyle[] = ['default', 'neon', 'cosmic', 'minimal']

const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    mode:   getStored<ThemeMode>('theme_mode', 'auto', THEME_MODES),
    cursor: getStored<CursorStyle>('theme_cursor', 'default', CURSOR_STYLES),
  } as ThemeState,
  reducers: {
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload
      try { localStorage.setItem('theme_mode', action.payload) } catch {}
    },
    setCursorStyle(state, action: PayloadAction<CursorStyle>) {
      state.cursor = action.payload
      try { localStorage.setItem('theme_cursor', action.payload) } catch {}
    },
  },
})

export const { setThemeMode, setCursorStyle } = themeSlice.actions
export default themeSlice.reducer
