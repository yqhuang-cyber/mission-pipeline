import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerMasterRoutes } from './routes/master.js'
import { registerMissionRoutes } from './routes/missions.js'

export async function buildApp() {
  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })
  await registerMasterRoutes(app)
  await registerMissionRoutes(app)
  return app
}
