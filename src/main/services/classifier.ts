import type { ClassificationResult, ExpenseCategory, FileCategory } from '@shared/types'
import { aiClassify, aiReady } from './ai'

const AI_THRESHOLD = 0.55

/* ------------------------------- Files ------------------------------- */

export function classifyFileByRules(
  fileName: string,
  ext: string,
  categories: FileCategory[]
): ClassificationResult {
  const name = fileName.toLowerCase()
  const e = ext.toLowerCase()
  let best: { cat: FileCategory; score: number; reasons: string[] } | null = null

  for (const cat of categories) {
    if (cat.id === 'other') continue
    let score = 0
    const reasons: string[] = []
    if (e && cat.extensions.includes(e)) {
      score += 6
      reasons.push(`.${e} file`)
    }
    for (const kw of cat.keywords) {
      if (kw && name.includes(kw.toLowerCase())) {
        score += 3
        reasons.push(`"${kw}"`)
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { cat, score, reasons }
  }

  if (!best) {
    return { categoryId: 'other', confidence: 0.25, method: 'rule', reason: 'No matching rule' }
  }
  const confidence = scoreToConfidence(best.score)
  return {
    categoryId: best.cat.id,
    confidence,
    method: 'rule',
    reason: `Matched ${best.reasons.slice(0, 3).join(', ')}`
  }
}

export async function classifyFile(
  fileName: string,
  ext: string,
  categories: FileCategory[]
): Promise<ClassificationResult> {
  const ruleResult = classifyFileByRules(fileName, ext, categories)
  if (ruleResult.confidence >= AI_THRESHOLD || !aiReady()) return ruleResult

  const ai = await aiClassify(
    `File name: ${fileName}`,
    categories.map((c) => ({ id: c.id, name: c.name, description: c.description }))
  )
  if (ai) {
    return { categoryId: ai.categoryId, confidence: 0.85, method: 'ai', reason: ai.reason }
  }
  return ruleResult
}

/* ------------------------------- Expenses ------------------------------- */

export function classifyExpenseByRules(
  text: string,
  amount: number,
  categories: ExpenseCategory[]
): ClassificationResult {
  const t = text.toLowerCase()
  let best: { cat: ExpenseCategory; score: number; reasons: string[] } | null = null

  for (const cat of categories) {
    if (cat.id === 'other-exp') continue
    let score = 0
    const reasons: string[] = []
    for (const kw of cat.keywords) {
      if (kw && t.includes(kw.toLowerCase())) {
        score += 4
        reasons.push(`"${kw}"`)
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { cat, score, reasons }
  }

  // Positive amounts with no expense match are likely income.
  if (!best && amount > 0) {
    return { categoryId: 'income', confidence: 0.4, method: 'rule', reason: 'Positive amount' }
  }
  if (!best) {
    return { categoryId: 'other-exp', confidence: 0.25, method: 'rule', reason: 'No matching rule' }
  }
  return {
    categoryId: best.cat.id,
    confidence: scoreToConfidence(best.score),
    method: 'rule',
    reason: `Matched ${best.reasons.slice(0, 3).join(', ')}`
  }
}

export async function classifyExpense(
  text: string,
  amount: number,
  categories: ExpenseCategory[]
): Promise<ClassificationResult> {
  const ruleResult = classifyExpenseByRules(text, amount, categories)
  if (ruleResult.confidence >= AI_THRESHOLD || !aiReady()) return ruleResult

  const ai = await aiClassify(
    `Transaction: ${text} (amount ${amount})`,
    categories.map((c) => ({ id: c.id, name: c.name }))
  )
  if (ai) {
    return { categoryId: ai.categoryId, confidence: 0.85, method: 'ai', reason: ai.reason }
  }
  return ruleResult
}

/* ------------------------------- Helpers ------------------------------- */

function scoreToConfidence(score: number): number {
  if (score >= 9) return 0.95
  if (score >= 6) return 0.82
  if (score >= 4) return 0.68
  if (score >= 3) return 0.6
  return 0.4
}
