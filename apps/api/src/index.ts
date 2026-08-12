import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })
config({ path: resolve(__dirname, '../.env') })

const port = Number(process.env.API_PORT || 3001)
const host = process.env.API_HOST || '0.0.0.0'

const app = await buildApp()
await app.listen({ port, host })
console.log(`API listening on http://${host}:${port}`)
