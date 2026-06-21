import Anthropic from '@anthropic-ai/sdk'
import { getApiKey, getConfig } from '../store/config'

function client(): Anthropic | null {
  const key = getApiKey()
  if (!key) return null
  return new Anthropic({ apiKey: key })
}

export function aiReady(): boolean {
  const cfg = getConfig()
  return cfg.aiEnabled && !!getApiKey()
}

/**
 * Ask Claude to pick the best category id from a list.
 * Returns the chosen id or null on any failure (caller falls back to rules).
 */
export async function aiClassify(
  subject: string,
  options: { id: string; name: string; description?: string }[]
): Promise<{ categoryId: string; reason: string } | null> {
  const c = client()
  if (!c) return null
  const cfg = getConfig()
  const list = options.map((o) => `- ${o.id}: ${o.name}${o.description ? ` (${o.description})` : ''}`).join('\n')
  try {
    const res = await c.messages.create({
      model: cfg.aiModel,
      max_tokens: 200,
      system:
        'You are a precise classifier for a personal file/expense organiser. ' +
        'Reply ONLY with a compact JSON object: {"categoryId": "<id>", "reason": "<short reason>"}. ' +
        'The categoryId MUST be one of the provided ids.',
      messages: [
        {
          role: 'user',
          content: `Categories:\n${list}\n\nClassify this item:\n"""${subject}"""\n\nReturn JSON only.`
        }
      ]
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as { categoryId?: string; reason?: string }
    if (!parsed.categoryId || !options.some((o) => o.id === parsed.categoryId)) return null
    return { categoryId: parsed.categoryId, reason: parsed.reason || 'AI classification' }
  } catch {
    return null
  }
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const c = client()
  if (!c) return { ok: false, message: 'No API key set.' }
  const cfg = getConfig()
  try {
    await c.messages.create({
      model: cfg.aiModel,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }]
    })
    return { ok: true, message: `Connected to ${cfg.aiModel}.` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Connection failed.' }
  }
}
