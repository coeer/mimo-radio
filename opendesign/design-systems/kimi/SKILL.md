---
name: kimi-design-system
description: Kimi AI Radio design system — late-night radio aesthetic. Deep charcoal, warm amber/copper glow, editorial typography.
---

# Kimi Design System

Late-night radio aesthetic for an AI DJ companion.

## Brand Voice
- Warm, intimate, soulful — like a friend who knows your music taste
- Never clinical or corporate
- Chinese-first, English secondary

## Color

### Raw tokens
- `--bg-void`: #050505 — deepest background
- `--bg-surface`: #0e0e12 — card/container surface
- `--bg-elevated`: #18181f — elevated cards, hover states
- `--fg-primary`: #f0f0f5 — primary text
- `--fg-secondary`: #8a8a9a — secondary text, labels
- `--fg-muted`: #4a4a5a — timestamps, inactive
- `--accent-warm`: #d4a574 — warm amber, the "radio glow"
- `--accent-copper`: #b8735a — copper accent for depth
- `--accent-glow`: rgba(212, 165, 116, 0.15) — ambient glow

### Semantic tokens
- `--surface-card`: var(--bg-surface) with 1px border rgba(255,255,255,0.04)
- `--text-title`: var(--fg-primary)
- `--text-artist`: var(--fg-secondary)
- `--text-timestamp`: var(--fg-muted)
- `--status-speaking`: var(--accent-warm)
- `--status-idle`: var(--fg-muted)
- `--waveform-active`: rgba(240, 240, 245, 0.6)
- `--waveform-idle`: rgba(240, 240, 245, 0.15)

## Typography

### Font stack
- Display: "Space Grotesk", "PingFang SC", "Microsoft YaHei", sans-serif
- Body: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif
- Mono: "JetBrains Mono", "SF Mono", "Cascadia Code", monospace

### Type scale
- `--text-hero`: 28px / 1.1 / 700 — song title
- `--text-subtitle`: 15px / 1.4 / 400 — album name
- `--text-body`: 13px / 1.5 / 400 — chat, labels
- `--text-caption`: 11px / 1.4 / 500 — timestamps, badges
- `--text-micro`: 10px / 1.3 / 500 — footer, hints

## Spacing
- `--space-xs`: 4px
- `--space-sm`: 8px
- `--space-md`: 16px
- `--space-lg`: 24px
- `--space-xl`: 32px
- `--radius-card`: 28px
- `--radius-pill`: 9999px
- `--radius-sm`: 12px

## Motion
- `--ease-out-expo`: cubic-bezier(0.16, 1, 0.3, 1)
- `--ease-in-out`: cubic-bezier(0.4, 0, 0.2, 1)
- `--duration-fast`: 150ms
- `--duration-normal`: 300ms
- `--duration-slow`: 500ms

### Patterns
- Card entrance: translateY(12px) → 0, opacity 0 → 1, 400ms ease-out-expo
- Button hover: scale(1.02), brightness increase, 150ms
- Waveform: continuous, spring-like motion
- Status dot: pulse animation, 2s infinite

## Background treatments
- Base: solid #050505
- Ambient glow: radial-gradient centered at 40% 30%, amber glow at 15% opacity
- Noise overlay: subtle static grain, 3% opacity, repeat
- Card gradient: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 60%)
