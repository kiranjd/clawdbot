---
name: focus
description: Track project focus, detect drift, stay on track across many projects.
metadata: {"clawdbot":{"emoji":"🎯"}}
---

# Focus - Project State Tracker

## Why This Exists

You start many things. That's fine - exploration is how you find what matters.

The problem: you start things, don't finish them, and they linger as open loops draining mental energy. Meanwhile, the things that actually matter (revenue, shipping) get neglected.

**This skill helps you:**
1. Know what you're actually working on (not what you think you're working on)
2. Detect drift - when you're touching random stuff instead of priorities
3. Make conscious decisions to focus, park, or kill projects
4. Keep many things going without losing track

**Philosophy:**
- File activity > git commits (not everything has git)
- Awareness > restriction (know what you're doing, then decide)
- Simple categories: active, exploring, parked, killed
- Max 3 focus items - more than that is lying to yourself

## Commands

### See What's Happening
```bash
bun {baseDir}/scripts/cli.ts status              # All project states
bun {baseDir}/scripts/cli.ts active              # Active projects only
bun {baseDir}/scripts/cli.ts pulse               # File activity last 24h in ~/things
bun {baseDir}/scripts/cli.ts pulse --hours 48    # Last 48 hours
bun {baseDir}/scripts/cli.ts drift               # Compare activity to focus (the important one)
```

### Manage Projects
```bash
bun {baseDir}/scripts/cli.ts focus <name> [commitment]   # Mark as active focus (max 3)
bun {baseDir}/scripts/cli.ts explore <name> [note]       # Mark as exploring (conscious exploration)
bun {baseDir}/scripts/cli.ts park <name> [reason]        # Park it (better than half-finished)
bun {baseDir}/scripts/cli.ts kill <name> [reason]        # Kill it (sunk cost is real)
```

## Categories

- **products**: Revenue-generating or important long-term projects
- **focus**: What you're actively committed to RIGHT NOW (max 3)
- **exploring**: Things you're touching but haven't committed to
- **parked**: Consciously paused - you made a decision
- **killed**: Consciously abandoned - you made a decision

## Activity Detection

Activity is tracked by **file modification times** in `~/things/`, not git.

Why: Not everything has git. Random experiments, notes, scripts - they all live in ~/things/ but won't have repos. File system is the source of truth for "what did I actually touch?"

Excluded from tracking:
- `node_modules/`, `.git/`, `dist/`, `build/`
- `.DS_Store`, `*.log`, lock files
- Hidden directories

## The Coaching Model

When you run `drift`:
1. Shows what you actually touched (file activity)
2. Compares to your stated focus
3. Flags mismatches: "You said X but you're working on Y"
4. Flags stale focus: "X is in focus but no activity for 3 days"
5. Flags exploration creep: "You've touched 5 new things this week"

The goal isn't to restrict you. It's to make drift **conscious**.

Working on something not in focus? Either:
- Add it to focus (if it matters)
- Mark it as exploring (if you're just poking around)
- Stop and get back to focus (if you're procrastinating)

## Data

State file: `~/.clawdbot/project-states.json`

## Examples

```bash
# Morning: what should I work on?
bun {baseDir}/scripts/cli.ts active

# Evening: what did I actually work on?
bun {baseDir}/scripts/cli.ts pulse

# Reality check: am I drifting?
bun {baseDir}/scripts/cli.ts drift

# Decision: this experiment is done
bun {baseDir}/scripts/cli.ts park my-experiment "Works but not priority"
```
