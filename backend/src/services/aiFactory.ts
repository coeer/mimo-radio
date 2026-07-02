import { AIService } from '../types'
import { MimoService } from './mimo'

export type AIModel = 'mimo-v2.5' | 'mimo-v2.5-pro'

const MIMO_MODELS = ['mimo-v2.5', 'mimo-v2.5-pro']

export function getAIService(model?: string): AIService {
  const m = model?.toLowerCase()

  if (MIMO_MODELS.includes(m || '')) {
    return new MimoService(m)
  }

  // Default to MiMo
  return new MimoService()
}

export function listAvailableModels(): { id: string; name: string; supportsImage: boolean }[] {
  return [
    { id: 'mimo-v2.5', name: 'MiMo V2.5', supportsImage: true },
    { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', supportsImage: false },
  ]
}
