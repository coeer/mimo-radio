/**
 * Application-wide constants.
 * Extract magic numbers for maintainability and single-source-of-truth configuration.
 */

// ─── AI Model ───
// MiMo 是推理模型（有 reasoning_content），需要足够 token 覆盖思考+输出
export const AI_MAX_TOKENS = 2048
export const AI_CHAT_HISTORY_LIMIT = 10       // Number of recent messages sent to AI as context
export const AI_MESSAGES_RETURN_LIMIT = 10   // Number of messages returned in chat response

// ─── Recommendation Engine ───
export const QUEUE_LENGTH = 20               // Default playlist queue size
export const TOP_K_CANDIDATES = 5            // Number of top-scored candidates to randomly pick from
export const DIVERSITY_PENALTY_SAME_ARTIST = 0.3

// Similarity scoring weights
export const WEIGHT_SAME_ARTIST = 0.3
export const WEIGHT_EMOTION_OVERLAP = 0.25
export const WEIGHT_SCENE_OVERLAP = 0.2
export const WEIGHT_MOOD_PROXIMITY_MAX = 0.3
export const MOOD_SCORE_FACTOR = 0.05

// ─── Input Limits ───
export const MAX_PROMPT_INPUT_LENGTH = 2000  // Hard limit for user prompt text
export const MAX_CHAT_TEXT_LENGTH = 2000
export const MAX_USER_INPUT_LENGTH = 500
export const MAX_MODEL_NAME_LENGTH = 50
export const MAX_MOOD_LENGTH = 100
export const MAX_REASON_LENGTH = 500
export const MAX_BASE64_IMAGE_SIZE = 10_000_000  // ~7.5MB

// ─── Profile ───
export const ESTIMATED_AVG_SONG_DURATION_SEC = 3.5 * 60  // Average song duration estimate
export const TOP_ARTISTS_COUNT = 5

// ─── Mood Tag Keywords (for tag-based filtering) ───
export const TAG_FILTER_KEYWORDS = [
  '爵士', '电子', '摇滚', '民谣', '古典', '韩语', '华语',
  '雨天', '深夜', '运动', '工作', '冥想',
] as const
