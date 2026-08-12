import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { completeMarkdown } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })
config({ path: resolve(__dirname, '../../.env') })

try {
  const r = await completeMarkdown({
    system: 'You are a ping bot.',
    user: 'Reply with exactly: ok',
  })
  console.log('OK', r.provider, r.model, JSON.stringify(r.text.slice(0, 120)))
} catch (e) {
  console.log('FAIL', e instanceof Error ? e.message : e)
}
