export function useApi() {
  const config = useRuntimeConfig()

  function resolveBase(): string {
    const configured = String(config.public.apiBase || '').replace(/\/$/, '')
    if (configured) return configured
    // Browser: same-origin → Nuxt devProxy /api → :3001
    // SSR: relative "/api/..." is invalid for fetch — hit API directly
    if (import.meta.server) {
      return (
        String(process.env.NUXT_PUBLIC_API_BASE || '')
          .replace(/\/$/, '')
          .replace(/\/api$/, '') || 'http://127.0.0.1:3001'
      )
    }
    return ''
  }

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    }
    if (options.body != null) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    }

    const base = resolveBase()
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
    let res: Response
    try {
      res = await fetch(url, {
        ...options,
        headers,
      })
    } catch (err) {
      const hint =
        '无法连接 API。请确认已启动：pnpm --filter @mission-pipeline/api dev（端口 3001）'
      throw new Error(
        `${hint}${err instanceof Error ? ` · ${err.message}` : ''}`,
      )
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || res.statusText)
    }
    return data as T
  }

  return { api, base: resolveBase() || '(same-origin /api)' }
}
