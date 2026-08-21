export type AuthUser = {
  id: string
  username: string
  role: string
}

export function useAuth() {
  const { api } = useApi()
  const user = useState<AuthUser | null>('auth-user', () => null)
  const checked = useState('auth-checked', () => false)

  async function refreshMe() {
    try {
      const res = await api<{ ok: boolean; user: AuthUser }>('/api/auth/me')
      user.value = res.user
      return res.user
    } catch {
      user.value = null
      return null
    } finally {
      checked.value = true
    }
  }

  async function login(username: string, password: string) {
    const res = await api<{ ok: boolean; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    user.value = res.user
    checked.value = true
    return res.user
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  return { user, checked, refreshMe, login, logout }
}
