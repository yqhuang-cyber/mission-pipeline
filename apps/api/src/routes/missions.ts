import type { FastifyInstance } from 'fastify'
import { createReadStream } from 'node:fs'
import { CreateMissionSchema } from '@mission-pipeline/shared'
import {
  createMission,
  getCanvas,
  getMission,
  listMissions,
} from '../services/missionService.js'
import {
  HttpError,
  approveNode,
  confirmN2Activities,
  getN2Structured,
  getN2V031,
  getNodeDetail,
  rejectNode,
  resolveDecision,
  runNode,
  saveN2Structured,
  saveN2V031,
  getN3Structured,
  saveN3Structured,
  ensureN4ExportFile,
  type N4DownloadFormat,
} from '../services/nodeService.js'
import type { MappedStep } from '../validators/n2.js'

function sendError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ error: err.message })
  }
  console.error(err)
  return reply.code(500).send({ error: 'Internal Server Error' })
}

export async function registerMissionRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true, service: 'mission-pipeline-api' }))

  app.get('/api/missions', async (_req, reply) => {
    try {
      return await listMissions()
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post('/api/missions', async (req, reply) => {
    try {
      const body = CreateMissionSchema.parse(req.body)
      const mission = await createMission(body)
      return reply.code(201).send(mission)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get<{ Params: { id: string } }>('/api/missions/:id', async (req, reply) => {
    try {
      const mission = await getMission(req.params.id)
      if (!mission) return reply.code(404).send({ error: 'Not found' })
      return mission
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get<{ Params: { id: string } }>(
    '/api/missions/:id/canvas',
    async (req, reply) => {
      try {
        const canvas = await getCanvas(req.params.id)
        if (!canvas) return reply.code(404).send({ error: 'Not found' })
        return canvas
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.get<{ Params: { id: string; node: string } }>(
    '/api/missions/:id/nodes/:node',
    async (req, reply) => {
      try {
        return await getNodeDetail(req.params.id, req.params.node)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.post<{ Params: { id: string; node: string } }>(
    '/api/missions/:id/nodes/:node/run',
    async (req, reply) => {
      try {
        return await runNode(req.params.id, req.params.node)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.post<{ Params: { id: string; node: string } }>(
    '/api/missions/:id/nodes/:node/approve',
    async (req, reply) => {
      try {
        return await approveNode(req.params.id, req.params.node)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.post<{ Params: { id: string; node: string } }>(
    '/api/missions/:id/nodes/:node/reject',
    async (req, reply) => {
      try {
        return await rejectNode(req.params.id, req.params.node)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.post<{
    Params: { id: string; decisionId: string }
    Body: { action: string; value?: string; optionId?: string }
  }>('/api/missions/:id/decisions/:decisionId/resolve', async (req, reply) => {
    try {
      return await resolveDecision(req.params.id, req.params.decisionId, req.body)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get<{ Params: { id: string } }>(
    '/api/missions/:id/artifacts/N2/structured',
    async (req, reply) => {
      try {
        return await getN2Structured(req.params.id)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/missions/:id/artifacts/N2/v031',
    async (req, reply) => {
      try {
        return await getN2V031(req.params.id)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.put<{
    Params: { id: string }
    Body: {
      steps: Array<{
        scriptStep: number
        activities: Array<{
          id: string
          title?: string
          intent?: string
          selectedComponentId: string
        }>
      }>
    }
  }>('/api/missions/:id/artifacts/N2/v031', async (req, reply) => {
    try {
      if (!req.body?.steps || !Array.isArray(req.body.steps)) {
        return reply.code(400).send({ error: 'body.steps required' })
      }
      return await saveN2V031(req.params.id, req.body)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post<{
    Params: { id: string }
    Body: {
      steps?: Array<{
        scriptStep: number
        activities: Array<{
          id: string
          title?: string
          intent?: string
          selectedComponentId: string
        }>
      }>
    }
  }>('/api/missions/:id/nodes/N2/confirm-activities', async (req, reply) => {
    try {
      return await confirmN2Activities(
        req.params.id,
        req.body?.steps ? { steps: req.body.steps } : undefined,
      )
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.put<{
    Params: { id: string }
    Body: { steps: MappedStep[] }
  }>('/api/missions/:id/artifacts/N2', async (req, reply) => {
    try {
      const steps = req.body?.steps
      if (!Array.isArray(steps) || steps.length === 0) {
        return reply.code(400).send({ error: 'body.steps required' })
      }
      return await saveN2Structured(req.params.id, steps)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get<{ Params: { id: string } }>(
    '/api/missions/:id/artifacts/N3/structured',
    async (req, reply) => {
      try {
        return await getN3Structured(req.params.id)
      } catch (err) {
        return sendError(reply, err)
      }
    },
  )

  app.put<{
    Params: { id: string }
    Body: { rows: unknown[] }
  }>('/api/missions/:id/artifacts/N3/structured', async (req, reply) => {
    try {
      const rows = req.body?.rows
      if (!Array.isArray(rows) || rows.length === 0) {
        return reply.code(400).send({ error: 'body.rows required' })
      }
      return await saveN3Structured(req.params.id, rows as never)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get<{
    Params: { id: string }
    Querystring: { format?: string }
  }>('/api/missions/:id/artifacts/N4/download', async (req, reply) => {
    try {
      const raw = (req.query.format || 'csv').toLowerCase()
      if (raw !== 'csv' && raw !== 'xlsx' && raw !== 'json') {
        return reply
          .code(400)
          .send({ error: 'format must be csv, xlsx, or json' })
      }
      const format = raw as N4DownloadFormat
      const file = await ensureN4ExportFile(req.params.id, format)
      const stream = createReadStream(file.path)
      return reply
        .header(
          'Content-Disposition',
          `attachment; filename="${file.filename}"`,
        )
        .type(file.contentType)
        .send(stream)
    } catch (err) {
      return sendError(reply, err)
    }
  })
}
