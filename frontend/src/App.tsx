import React from 'react'
import { Provider } from 'react-redux'
import { store } from './store'
import { useSelector } from 'react-redux'
import { RootState } from './store'
import { LoginPage } from './pages/LoginPage'
import { AppLayout } from './pages/AppLayout'

const AppContent: React.FC = () => {
  const { user, token } = useSelector((s: RootState) => s.auth)
  const isLoggedIn = Boolean(user && token)

  // Redirect to dashboard before AppLayout mounts so useCurrentPath
  // initialises with '/' and the sidebar highlights Dashboard correctly.
  if (isLoggedIn && window.location.pathname !== '/') {
    window.history.replaceState({}, '', '/')
  }

  if (!isLoggedIn) return <LoginPage />
  return <AppLayout />
}

const App: React.FC = () => (
  <Provider store={store}>
    <AppContent />
  </Provider>
)

export default App
