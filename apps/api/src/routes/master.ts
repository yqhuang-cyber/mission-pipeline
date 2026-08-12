import { createReadStream, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import {
  getMasterComponentsPayload,
  resolveSafeImagePath,
} from '../master/catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function masterRoot(): string {
  return process.env.MASTER_DATA_DIR || resolve(__dirname, '../../../../master')
}

export async function registerMasterRoutes(app: FastifyInstance) {
  app.get('/api/master/components', async () => getMasterComponentsPayload())

  app.get('/api/master/mission-phase-step-meta-model', async (_req, reply) => {
    const path = resolve(masterRoot(), 'mission_phase_step_meta_model.md')
    if (!existsSync(path)) {
      return reply.code(404).send({ error: 'Meta model not found' })
    }
    const markdown = readFileSync(path, 'utf8')
    return {
      file: 'mission_phase_step_meta_model.md',
      markdown,
    }
  })

  app.get<{ Params: { file: string } }>(
    '/api/master/component-images/:file',
    async (req, reply) => {
      const file = decodeURIComponent(req.params.file)
      const full = resolveSafeImagePath(file)
      if (!full) return reply.code(404).send({ error: 'Image not found' })
      const stream = createReadStream(full)
      const lower = file.toLowerCase()
      const type = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'application/octet-stream'
      return reply
        .type(type)
        .header('Cache-Control', 'public, max-age=86400')
        .send(stream)
    },
  )
}
