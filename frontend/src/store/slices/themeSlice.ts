import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'light' | 'dark' | 'midnight'
export type CursorStyle = 'default' | 'neon' | 'cosmic' | 'minimal'

interface ThemeState {
  mode: ThemeMode
  cursor: CursorStyle
}

function getStored<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}

const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    mode:   getStored<ThemeMode>('theme_mode', 'light'),
    cursor: getStored<CursorStyle>('theme_cursor', 'default'),
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
