/**
 * Prompt Injection & XSS defense utilities.
 *
 * Defense layers:
 * 1. Input sanitization — remove/replace dangerous patterns
 * 2. Output validation — ensure LLM output doesn't contain injection payloads
 * 3. Delimiter isolation — wrap user input in XML-like delimiters with escaping
 */

import { MAX_PROMPT_INPUT_LENGTH } from '../constants'

// Common prompt injection markers
const INJECTION_PATTERNS = [
  /\[\s*(system|user|assistant|end|instruction)\s*\]/gi,
  /ignore\s+previous\s+instructions?/gi,
  /ignore\s+above/gi,
  /you\s+are\s+now\s+/gi,
  /new\s+role\s*:/gi,
  /\{\{\s*.*?\s*\}\}/g, // template injection
  /<%.*?%>/g, // template injection
  /\$\{.*?\}/g, // template injection
]

/**
 * Sanitize user input before embedding into prompts.
 * Removes common injection patterns and escapes XML-like delimiters.
 */
export function sanitizePromptInput(input: string): string {
  let sanitized = input.trim().slice(0, MAX_PROMPT_INPUT_LENGTH) // hard limit

  // Replace injection patterns with [REDACTED]
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }

  // Escape XML-like delimiters used in prompt wrapping
  sanitized = sanitized
    .replace(/</g, '⟨')
    .replace(/>/g, '⟩')

  return sanitized
}

/**
 * Validate LLM output for potential injection payloads.
 * Returns cleaned text + whether it was flagged.
 */
export function validatePromptOutput(output: string): { text: string; flagged: boolean } {
  let text = output
  let flagged = false

  // Detect control characters / zero-width chars
  // eslint-disable-next-line no-control-regex
  const dangerousChars = /[\u0000-\u001F\u200B-\u200F\uFEFF\u2028\u2029]/g
  if (dangerousChars.test(text)) {
    text = text.replace(dangerousChars, '')
    flagged = true
  }

  // Detect nested delimiters that might break out
  if (/⟨\s*\/\s*(user|system|assistant)/i.test(text)) {
    flagged = true
    text = text.replace(/⟨\s*\/\s*(user|system|assistant)\s*⟩/gi, '[REDACTED]')
  }

  return { text, flagged }
}

/**
 * Wrap user input in isolated delimiters for prompt construction.
 */
export function wrapUserInput(input: string): string {
  const safe = sanitizePromptInput(input)
  return `⟨user_input⟩\n${safe}\n⟨/user_input⟩`
}
