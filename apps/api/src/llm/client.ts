export class LlmUnavailableError extends Error {
  constructor(message = 'LLM API key not set') {
    super(message)
    this.name = 'LlmUnavailableError'
  }
}

export type LlmCompleteInput = {
  system: string
  user: string
  temperature?: number
}

export type LlmProvider = 'minimax' | 'openai' | 'heuristic'

export type LlmCompleteResult = {
  text: string
  model: string
  provider: LlmProvider
  usage?: { promptTokens?: number; completionTokens?: number }
}

type LlmConfig = {
  provider: 'minimax' | 'openai'
  apiKey: string
  baseUrl: string
  model: string
}

function resolveLlmConfig(): LlmConfig | null {
  const providerEnv = (process.env.LLM_PROVIDER || 'minimax').toLowerCase()

  const minimaxKey =
    process.env.MINIMAX_API_KEY ||
    (providerEnv === 'minimax' ? process.env.OPENAI_API_KEY : undefined)
  if (minimaxKey || providerEnv === 'minimax') {
    if (!minimaxKey) return null
    return {
      provider: 'minimax',
      apiKey: minimaxKey,
      // Mainland (sk-cp-*): api.minimaxi.com · International: api.minimax.io
      baseUrl: (
        process.env.MINIMAX_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        'https://api.minimaxi.com/v1'
      ).replace(/\/$/, ''),
      model: process.env.MINIMAX_MODEL || process.env.OPENAI_MODEL || 'MiniMax-M2.5',
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
        /\/$/,
        '',
      ),
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    }
  }

  return null
}

export async function completeMarkdown(
  input: LlmCompleteInput,
): Promise<LlmCompleteResult> {
  const config = resolveLlmConfig()
  if (!config) {
    throw new LlmUnavailableError(
      'Set MINIMAX_API_KEY (recommended) or OPENAI_API_KEY',
    )
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: input.temperature ?? 0.2,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `${config.provider} error ${res.status}: ${body.slice(0, 800)}`,
    )
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const raw = json.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error(`${config.provider} returned empty content`)

  // MiniMax M2.x may wrap chain-of-thought in <think>...</think>
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim()
  if (!text) {
    throw new Error(
      `${config.provider} returned only thinking content; try another model or disable thinking`,
    )
  }

  return {
    text,
    model: config.model,
    provider: config.provider,
    usage: {
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
    },
  }
}
