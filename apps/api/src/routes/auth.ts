import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'

type SessionUser = {
  id: string
  username: string
  role: 'admin'
}

const sessions = new Map<string, SessionUser>()

const COOKIE = 'mp_session_id'
const MAX_AGE = 60 * 60 * 12 // 12h

function adminUser(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  }
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

function sessionCookie(id: string, clear = false): string {
  if (clear) {
    return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  }
  return `${COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`
}

function userFromRequest(req: { headers: Record<string, unknown> }): SessionUser | null {
  const raw = String(req.headers.cookie || '')
  const sid = parseCookies(raw)[COOKIE]
  if (!sid) return null
  return sessions.get(sid) || null
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body || {}) as { username?: string; password?: string }
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    const admin = adminUser()
    if (username !== admin.username || password !== admin.password) {
      return reply.code(401).send({ error: '用户名或密码错误' })
    }
    const sid = randomUUID()
    const user: SessionUser = {
      id: '1',
      username: admin.username,
      role: 'admin',
    }
    sessions.set(sid, user)
    reply.header('Set-Cookie', sessionCookie(sid))
    return { ok: true, user }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = parseCookies(String(req.headers.cookie || ''))[COOKIE]
    if (sid) sessions.delete(sid)
    reply.header('Set-Cookie', sessionCookie('', true))
    return { ok: true }
  })

  app.get('/api/auth/me', async (req, reply) => {
    const user = userFromRequest(req)
    if (!user) return reply.code(401).send({ error: '未登录' })
    return { ok: true, user }
  })
}
