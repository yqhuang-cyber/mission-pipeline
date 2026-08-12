import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import type { NodeId } from '@mission-pipeline/shared'
import { writeArtifactToDisk } from '../services/artifactFs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../../.env') })
config({ path: resolve(__dirname, '../../../.env') })

const prisma = new PrismaClient()

const latest = await prisma.artifact.findMany({
  orderBy: { createdAt: 'desc' },
})

const seen = new Set<string>()
let n = 0
for (const a of latest) {
  const key = `${a.missionId}:${a.node}`
  if (seen.has(key)) continue
  seen.add(key)
  const mission = await prisma.mission.findUnique({ where: { id: a.missionId } })
  const path = await writeArtifactToDisk({
    missionId: a.missionId,
    missionName: mission?.name,
    node: a.node as NodeId,
    content: a.content,
    version: a.version,
  })
  console.log('wrote', path)
  n++
}
console.log(`exported ${n} latest artifacts`)
await prisma.$disconnect()
