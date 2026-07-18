import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { RadioSession, UserProfile } from '../types'
import { logger, toErrorMeta } from '../utils/logger'

const DATA_DIR = join(__dirname, '../../data')
const DB_PATH = join(DATA_DIR, 'mimo.db')

// Session TTL: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
// Cleanup interval: 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

let db: Database | null = null

function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb() {
  // Ensure data directory exists before opening database
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
    logger.info('Created data directory', { path: DATA_DIR })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // Songs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `)

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      queue TEXT NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      dj_enabled INTEGER NOT NULL DEFAULT 1,
      context TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  // Index on updated_at for efficient TTL cleanup queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at)
  `)

  // Profile table (single row)
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    )
  `)

  // Feedback table — 用户反馈（like/skip/complete）落库，形成品味闭环
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      song_id TEXT NOT NULL,
      song_title TEXT,
      song_artist TEXT,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feedback_song ON feedback(song_id)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feedback_action ON feedback(action)
  `)

  logger.info('SQLite database initialized')
}

/** 保存一条用户反馈 */
export function saveFeedback(entry: {
  sessionId?: string | null
  songId: string
  songTitle?: string
  songArtist?: string
  action: string
}): void {
  try {
    const db = getDb()
    db.prepare(
      `INSERT INTO feedback (session_id, song_id, song_title, song_artist, action, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      entry.sessionId || null,
      entry.songId,
      entry.songTitle || null,
      entry.songArtist || null,
      entry.action,
      new Date().toISOString(),
    )
  } catch (err) {
    logger.error('saveFeedback failed', { ...toErrorMeta(err) })
  }
}

/** 统计反馈（用于品味画像） */
export function getFeedbackStats(): {
  total: number
  likes: number
  unlikes: number
  skips: number
  completes: number
} {
  try {
    const db = getDb()
    const row = db.prepare(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN action = 'like' THEN 1 ELSE 0 END), 0) as likes,
         COALESCE(SUM(CASE WHEN action = 'unlike' THEN 1 ELSE 0 END), 0) as unlikes,
         COALESCE(SUM(CASE WHEN action = 'skip' THEN 1 ELSE 0 END), 0) as skips,
         COALESCE(SUM(CASE WHEN action = 'complete' THEN 1 ELSE 0 END), 0) as completes
       FROM feedback`
    ).get() as { total: number; likes: number; unlikes: number; skips: number; completes: number }
    return row
  } catch {
    return { total: 0, likes: 0, unlikes: 0, skips: 0, completes: 0 }
  }
}

/**
 * 从 feedback 表提取用户偏好的歌手（按 like 次数排序，排除 unlike）。
 * 用于推荐加权——用户收藏过的歌手，搜索时优先。
 */
export function getLikedArtists(limit = 5): Array<{ artist: string; count: number }> {
  try {
    const db = getDb()
    const rows = db.prepare(
      `SELECT song_artist as artist, COUNT(*) as count
       FROM feedback
       WHERE action = 'like' AND song_artist IS NOT NULL AND song_artist != ''
       GROUP BY song_artist
       ORDER BY count DESC
       LIMIT ?`
    ).all(limit) as Array<{ artist: string; count: number }>
    return rows
  } catch {
    return []
  }
}

/**
 * 提取用户跳过的歌手（负反馈，用于避雷）。
 */
export function getDislikedArtists(limit = 3): Array<{ artist: string; count: number }> {
  try {
    const db = getDb()
    const rows = db.prepare(
      `SELECT song_artist as artist, COUNT(*) as count
       FROM feedback
       WHERE action = 'skip' AND song_artist IS NOT NULL AND song_artist != ''
       GROUP BY song_artist
       ORDER BY count DESC
       LIMIT ?`
    ).all(limit) as Array<{ artist: string; count: number }>
    return rows
  } catch {
    return []
  }
}

// ─── Sessions ───

function rowToSession(row: {
  id: string
  queue: string
  current_index: number
  dj_enabled: number
  context: string
  messages: string
  created_at: string
  updated_at: string
}): RadioSession {
  return {
    id: row.id,
    queue: JSON.parse(row.queue),
    currentIndex: row.current_index,
    djEnabled: Boolean(row.dj_enabled),
    context: JSON.parse(row.context),
    messages: JSON.parse(row.messages),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function getSession(id: string): RadioSession | undefined {
  const row = getDb()
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as Parameters<typeof rowToSession>[0] | undefined
  if (!row) return undefined
  return rowToSession(row)
}

export function setSession(id: string, session: RadioSession, refreshUpdatedAt = true) {
  if (refreshUpdatedAt) {
    session.updatedAt = new Date()
  }
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO sessions
       (id, queue, current_index, dj_enabled, context, messages, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      session.id,
      JSON.stringify(session.queue),
      session.currentIndex,
      session.djEnabled ? 1 : 0,
      JSON.stringify(session.context),
      JSON.stringify(session.messages),
      session.createdAt.toISOString(),
      session.updatedAt.toISOString()
    )
}

// ─── Profile ───

export function getProfile(): UserProfile | null {
  const row = getDb().prepare('SELECT data FROM profile WHERE id = 1').get() as { data: string } | undefined
  if (!row) return null
  return JSON.parse(row.data)
}

export function setProfile(p: UserProfile) {
  getDb()
    .prepare('INSERT OR REPLACE INTO profile (id, data) VALUES (1, ?)')
    .run(JSON.stringify(p))
}

// ─── Session TTL & Cleanup ───

function cleanupExpiredSessions(): number {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString()
  const result = getDb().prepare('DELETE FROM sessions WHERE updated_at < ?').run(cutoff)
  const removed = result.changes
  if (removed > 0) {
    logger.info(`Cleaned up ${removed} expired sessions`)
  }
  return removed
}

export function checkDbHealth(): boolean {
  try {
    getDb().prepare('SELECT 1').get()
    return true
  } catch {
    return false
  }
}

export function startSessionCleanup(): void {
  cleanupExpiredSessions()
  setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS)
  logger.info('Session cleanup started', { ttlHours: 24 })
}
