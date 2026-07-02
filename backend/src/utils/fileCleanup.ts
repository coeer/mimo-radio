import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { logger } from './logger'

export interface CleanupOptions {
  maxFiles?: number
  maxAgeMs?: number
  maxTotalSizeMb?: number
}

const DEFAULT_OPTIONS: Required<CleanupOptions> = {
  maxFiles: 100,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxTotalSizeMb: 500,
}

/**
 * Clean up old TTS audio files from the static/audio directory.
 * Keeps the directory under control by limiting file count, age, and total size.
 */
export async function cleanupAudioFiles(
  audioDir: string,
  options: CleanupOptions = {}
): Promise<{ deleted: number; freedBytes: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let deleted = 0
  let freedBytes = 0

  try {
    const entries = await readdir(audioDir)
    const files: { name: string; path: string; stat: { mtime: Date; size: number } }[] = []

    for (const name of entries) {
      if (!name.endsWith('.mp3')) continue
      const filePath = join(audioDir, name)
      try {
        const s = await stat(filePath)
        files.push({ name, path: filePath, stat: { mtime: s.mtime, size: s.size } })
      } catch {
        // ignore stat errors
      }
    }

    if (files.length === 0) return { deleted, freedBytes }

    const now = Date.now()
    const maxAgeCutoff = now - opts.maxAgeMs
    const maxTotalSizeBytes = opts.maxTotalSizeMb * 1024 * 1024

    // Sort by modification time (oldest first)
    files.sort((a, b) => a.stat.mtime.getTime() - b.stat.mtime.getTime())

    // Calculate current total size
    let totalSize = files.reduce((sum, f) => sum + f.stat.size, 0)

    for (const file of files) {
      const shouldDelete =
        files.length - deleted > opts.maxFiles ||
        file.stat.mtime.getTime() < maxAgeCutoff ||
        totalSize > maxTotalSizeBytes

      if (shouldDelete) {
        try {
          await unlink(file.path)
          deleted++
          freedBytes += file.stat.size
          totalSize -= file.stat.size
        } catch {
          // ignore unlink errors
        }
      }
    }

    if (deleted > 0) {
      logger.info('Audio cleanup completed', { deleted, freedMb: Math.round(freedBytes / 1024 / 1024) })
    }
  } catch (err) {
    logger.warn('Audio cleanup failed', { error: String(err) })
  }

  return { deleted, freedBytes }
}

/**
 * Start a periodic cleanup job.
 */
export function startPeriodicCleanup(
  audioDir: string,
  intervalMs: number = 60 * 60 * 1000, // 1 hour
  options?: CleanupOptions
): () => void {
  // Run immediately on start
  cleanupAudioFiles(audioDir, options).catch(() => {})

  const timer = setInterval(() => {
    cleanupAudioFiles(audioDir, options).catch(() => {})
  }, intervalMs)

  return () => clearInterval(timer)
}
