import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerAuthRoutes } from './routes/auth.js'
import { registerMasterRoutes } from './routes/master.js'
import { registerMissionRoutes } from './routes/missions.js'

export async function buildApp() {
  const app = Fastify({ logger: true })
  await app.register(cors, {
    origin: true,
    credentials: true,
  })
  await registerAuthRoutes(app)
  await registerMasterRoutes(app)
  await registerMissionRoutes(app)
  return app
}
