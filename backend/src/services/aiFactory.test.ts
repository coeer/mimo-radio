import { describe, it, expect } from 'vitest'
import { getAIService, listAvailableModels } from './aiFactory'
import { MimoService } from './mimo'

describe('aiFactory', () => {
  describe('getAIService', () => {
    it('should return MimoService by default (no model specified)', () => {
      const service = getAIService()
      expect(service).toBeInstanceOf(MimoService)
    })

    it('should return MimoService for mimo-v2.5', () => {
      const service = getAIService('mimo-v2.5')
      expect(service).toBeInstanceOf(MimoService)
      expect(service.model).toBe('mimo-v2.5')
    })

    it('should return MimoService for mimo-v2.5-pro', () => {
      const service = getAIService('mimo-v2.5-pro')
      expect(service).toBeInstanceOf(MimoService)
      expect(service.model).toBe('mimo-v2.5-pro')
    })

    it('should fallback to default MimoService for unknown model', () => {
      const service = getAIService('unknown-model')
      expect(service).toBeInstanceOf(MimoService)
    })

    it('should handle undefined model', () => {
      const service = getAIService(undefined)
      expect(service).toBeInstanceOf(MimoService)
    })

    it('should handle empty string model', () => {
      const service = getAIService('')
      expect(service).toBeInstanceOf(MimoService)
    })
  })

  describe('listAvailableModels', () => {
    it('should return an array of models', () => {
      const models = listAvailableModels()
      expect(models).toBeInstanceOf(Array)
      expect(models.length).toBeGreaterThan(0)
    })

    it('should include mimo-v2.5', () => {
      const models = listAvailableModels()
      const mimo = models.find(m => m.id === 'mimo-v2.5')
      expect(mimo).toBeDefined()
      expect(mimo!.name).toBe('MiMo V2.5')
      expect(mimo!.supportsImage).toBe(true)
    })

    it('should include mimo-v2.5-pro', () => {
      const models = listAvailableModels()
      const mimoPro = models.find(m => m.id === 'mimo-v2.5-pro')
      expect(mimoPro).toBeDefined()
      expect(mimoPro!.name).toBe('MiMo V2.5 Pro')
    })

    it('each model should have id, name, and supportsImage', () => {
      const models = listAvailableModels()
      for (const model of models) {
        expect(model).toHaveProperty('id')
        expect(model).toHaveProperty('name')
        expect(model).toHaveProperty('supportsImage')
        expect(typeof model.id).toBe('string')
        expect(typeof model.name).toBe('string')
        expect(typeof model.supportsImage).toBe('boolean')
      }
    })
  })
})
