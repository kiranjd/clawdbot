#!/usr/bin/env bun
/**
 * Focus CLI - Project state tracker
 *
 * WHY THIS EXISTS:
 * You start many things. That's fine - exploration is how you find what matters.
 * The problem: things linger as open loops, draining mental energy.
 * This helps you know what you're ACTUALLY working on and make conscious decisions.
 *
 * PHILOSOPHY:
 * - File activity > git commits (not everything has git)
 * - Awareness > restriction (know what you're doing, then decide)
 * - Max 3 focus items - more than that is lying to yourself
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

const STATE_FILE = join(homedir(), ".clawdbot", "project-states.json");
const THINGS_DIR = join(homedir(), "things");

// Directories to exclude from activity tracking
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  "target", // Rust
  "Pods", // iOS
  "DerivedData",
  ".build", // Swift
]);

// Files to exclude
const EXCLUDE_PATTERNS = [
  /^\.DS_Store$/,
  /\.log$/,
  /\.lock$/,
  /lock\.json$/,
  /\.pyc$/,
  /\.o$/,
  /\.a$/,
];

interface Product {
  name: string;
  repo: string;
  outcome: string;
  deadline: string | null;
  why: string;
  status: "active" | "paused";
}

interface FocusItem {
  name: string;
  commitment: string;
  committed: string;
}

interface ExploreItem {
  name: string;
  touches: number;
  first_touched: string;
  last_touched: string;
  note: string;
}

interface ParkedItem {
  name: string;
  reason: string;
  parked: string;
}

interface KilledItem {
  name: string;
  reason: string;
  killed: string;
}

interface ProjectStates {
  last_updated: string;
  products: Product[];
  focus: FocusItem[];
  exploring: ExploreItem[];
  parked: ParkedItem[];
  killed: KilledItem[];
}

interface ActivityInfo {
  name: string;
  fileCount: number;
  latestMod: Date;
  hasGit: boolean;
}

function loadState(): ProjectStates {
  if (!existsSync(STATE_FILE)) {
    return {
      last_updated: new Date().toISOString(),
      products: [],
      focus: [],
      exploring: [],
      parked: [],
      killed: [],
    };
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state: ProjectStates): void {
  state.last_updated = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function shouldExclude(name: string): boolean {
  if (EXCLUDE_DIRS.has(name)) return true;
  if (name.startsWith(".")) return true;
  return EXCLUDE_PATTERNS.some((p) => p.test(name));
}

/**
 * Get file activity in ~/things/ by scanning modification times
 * This is the source of truth - not git
 */
function getFileActivity(hours = 24): Map<string, ActivityInfo> {
  const activity = new Map<string, ActivityInfo>();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  if (!existsSync(THINGS_DIR)) return activity;

  // Get top-level directories in ~/things/
  for (const name of readdirSync(THINGS_DIR)) {
    if (shouldExclude(name)) continue;

    const projectDir = join(THINGS_DIR, name);
    try {
      const stat = statSync(projectDir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    // Count recently modified files in this project
    let fileCount = 0;
    let latestMod = new Date(0);

    const scanDir = (dir: string, depth = 0): void => {
      if (depth > 10) return; // Prevent infinite recursion

      try {
        for (const entry of readdirSync(dir)) {
          if (shouldExclude(entry)) continue;

          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
              scanDir(fullPath, depth + 1);
            } else if (stat.mtimeMs > cutoff) {
              fileCount++;
              if (stat.mtime > latestMod) {
                latestMod = stat.mtime;
              }
            }
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    scanDir(projectDir);

    if (fileCount > 0) {
      const hasGit = existsSync(join(projectDir, ".git"));
      activity.set(name, { name, fileCount, latestMod, hasGit });
    }
  }

  return activity;
}

function formatTimeAgo(date: Date): string {
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// ============ COMMANDS ============

function cmdStatus(): void {
  const state = loadState();

  console.log("# Project States\n");
  console.log(`Last updated: ${state.last_updated}\n`);

  if (state.products.length > 0) {
    console.log("## Products (revenue/important)");
    for (const p of state.products) {
      const status = p.status === "active" ? "●" : "○";
      console.log(`${status} ${p.name} → ${p.outcome}`);
      if (p.deadline) console.log(`  Deadline: ${p.deadline}`);
    }
    console.log();
  }

  if (state.focus.length > 0) {
    console.log("## Focus (max 3)");
    for (const f of state.focus) {
      console.log(`● ${f.name}: ${f.commitment}`);
    }
    console.log();
  }

  if (state.exploring.length > 0) {
    console.log("## Exploring (not committed)");
    for (const e of state.exploring) {
      console.log(`○ ${e.name} (${e.touches}x, last: ${e.last_touched})`);
    }
    console.log();
  }

  if (state.parked.length > 0) {
    console.log("## Parked (conscious pause)");
    for (const p of state.parked) {
      console.log(`◐ ${p.name}: ${p.reason}`);
    }
    console.log();
  }

  if (state.killed.length > 0) {
    console.log("## Killed");
    for (const k of state.killed) {
      console.log(`✗ ${k.name}: ${k.reason}`);
    }
  }
}

function cmdActive(): void {
  const state = loadState();

  console.log("# Active Right Now\n");

  if (state.products.filter((p) => p.status === "active").length === 0 && state.focus.length === 0) {
    console.log("Nothing marked as active. Run `focus <name>` to set focus.");
    return;
  }

  for (const p of state.products.filter((p) => p.status === "active")) {
    console.log(`● ${p.name} → ${p.outcome}`);
  }

  for (const f of state.focus) {
    console.log(`● ${f.name}: ${f.commitment}`);
  }
}

function cmdPulse(hours = 24): void {
  const activity = getFileActivity(hours);

  console.log(`# Activity Pulse (last ${hours}h)\n`);

  if (activity.size === 0) {
    console.log("No file changes detected in ~/things/");
    return;
  }

  // Sort by file count (most active first)
  const sorted = [...activity.values()].sort((a, b) => b.fileCount - a.fileCount);

  for (const a of sorted) {
    const git = a.hasGit ? "" : " (no git)";
    console.log(`${a.name}: ${a.fileCount} files changed, ${formatTimeAgo(a.latestMod)}${git}`);
  }
}

function cmdDrift(hours = 24): void {
  const state = loadState();
  const activity = getFileActivity(hours);

  console.log(`# Drift Check (last ${hours}h)\n`);

  // Build sets of known projects
  const focusNames = new Set([
    ...state.focus.map((f) => f.name),
    ...state.products.filter((p) => p.status === "active").map((p) => p.repo),
  ]);
  const exploringNames = new Set(state.exploring.map((e) => e.name));
  const parkedNames = new Set(state.parked.map((p) => p.name));
  const killedNames = new Set(state.killed.map((k) => k.name));

  const sorted = [...activity.values()].sort((a, b) => b.fileCount - a.fileCount);

  // Categorize activity
  const focusActivity: ActivityInfo[] = [];
  const exploreActivity: ActivityInfo[] = [];
  const driftActivity: ActivityInfo[] = [];
  const parkedActivity: ActivityInfo[] = [];

  for (const a of sorted) {
    if (focusNames.has(a.name)) {
      focusActivity.push(a);
    } else if (exploringNames.has(a.name)) {
      exploreActivity.push(a);
    } else if (parkedNames.has(a.name) || killedNames.has(a.name)) {
      parkedActivity.push(a);
    } else {
      driftActivity.push(a);
    }
  }

  // Report
  if (focusActivity.length > 0) {
    console.log("## ✓ Focus Activity (good)");
    for (const a of focusActivity) {
      console.log(`  ● ${a.name}: ${a.fileCount} files`);
    }
    console.log();
  }

  // Check for stale focus (no activity on focus items)
  const staleFocus = [...focusNames].filter((name) => !activity.has(name));
  if (staleFocus.length > 0) {
    console.log("## ⚠ Stale Focus (no activity)");
    for (const name of staleFocus) {
      console.log(`  ○ ${name} - in focus but no changes`);
    }
    console.log();
  }

  if (exploreActivity.length > 0) {
    console.log("## ○ Exploring (conscious)");
    for (const a of exploreActivity) {
      console.log(`  ○ ${a.name}: ${a.fileCount} files`);
    }
    console.log();
  }

  if (driftActivity.length > 0) {
    console.log("## ⚡ DRIFT (unknown projects)");
    console.log("  You touched these but they're not in any category:");
    for (const a of driftActivity) {
      console.log(`  ? ${a.name}: ${a.fileCount} files`);
    }
    console.log("\n  → Run 'focus', 'explore', or 'park' to categorize them");
    console.log();
  }

  if (parkedActivity.length > 0) {
    console.log("## ⚠ Parked/Killed Activity");
    console.log("  You touched these but marked them as done:");
    for (const a of parkedActivity) {
      console.log(`  ! ${a.name}: ${a.fileCount} files`);
    }
    console.log("\n  → Either un-park them or stop working on them");
    console.log();
  }

  // Summary
  const total = sorted.length;
  const onTrack = focusActivity.length + exploreActivity.length;
  const offTrack = driftActivity.length + parkedActivity.length;

  console.log("---");
  console.log(`${total} projects touched: ${onTrack} on-track, ${offTrack} drift/parked`);

  if (staleFocus.length > 0) {
    console.log(`⚠ ${staleFocus.length} focus items with no activity`);
  }

  if (driftActivity.length > 0) {
    console.log(`⚡ ${driftActivity.length} uncategorized - decide: focus, explore, or park?`);
  }
}

function cmdFocus(name: string, commitment?: string): void {
  const state = loadState();

  // Check max 3 focus items
  if (state.focus.length >= 3 && !state.focus.find((f) => f.name === name)) {
    console.log("⚠ Already have 3 focus items. Max 3 - more than that is lying to yourself.");
    console.log("\nCurrent focus:");
    for (const f of state.focus) {
      console.log(`  ● ${f.name}`);
    }
    console.log("\n→ Park or kill something first, or use 'explore' for this one.");
    return;
  }

  // Remove from other categories
  state.exploring = state.exploring.filter((e) => e.name !== name);
  state.parked = state.parked.filter((p) => p.name !== name);

  const existing = state.focus.find((f) => f.name === name);
  if (existing) {
    if (commitment) existing.commitment = commitment;
    console.log(`Updated: ${name}`);
  } else {
    state.focus.push({
      name,
      commitment: commitment || "Active work",
      committed: today(),
    });
    console.log(`Added to focus: ${name}`);
  }

  saveState(state);
  console.log(`\nFocus (${state.focus.length}/3):`);
  for (const f of state.focus) {
    console.log(`  ● ${f.name}: ${f.commitment}`);
  }
}

function cmdExplore(name: string, note?: string): void {
  const state = loadState();

  // Remove from other categories
  state.focus = state.focus.filter((f) => f.name !== name);
  state.parked = state.parked.filter((p) => p.name !== name);

  const existing = state.exploring.find((e) => e.name === name);
  if (existing) {
    existing.touches++;
    existing.last_touched = today();
    if (note) existing.note = note;
    console.log(`Updated: ${name} (${existing.touches} touches)`);
  } else {
    state.exploring.push({
      name,
      touches: 1,
      first_touched: today(),
      last_touched: today(),
      note: note || "",
    });
    console.log(`Exploring: ${name}`);
  }

  saveState(state);
}

function cmdPark(name: string, reason?: string): void {
  const state = loadState();

  state.focus = state.focus.filter((f) => f.name !== name);
  state.exploring = state.exploring.filter((e) => e.name !== name);

  // Check if already parked
  if (!state.parked.find((p) => p.name === name)) {
    state.parked.push({
      name,
      reason: reason || "Paused",
      parked: today(),
    });
  }

  console.log(`Parked: ${name}`);
  saveState(state);
}

function cmdKill(name: string, reason?: string): void {
  const state = loadState();

  state.focus = state.focus.filter((f) => f.name !== name);
  state.exploring = state.exploring.filter((e) => e.name !== name);
  state.parked = state.parked.filter((p) => p.name !== name);

  // Check if already killed
  if (!state.killed.find((k) => k.name === name)) {
    state.killed.push({
      name,
      reason: reason || "Done",
      killed: today(),
    });
  }

  console.log(`Killed: ${name}`);
  saveState(state);
}

// ============ CLI ============

const [, , cmd, ...args] = process.argv;

// Parse --hours flag
let hours = 24;
const hoursIdx = args.indexOf("--hours");
if (hoursIdx !== -1 && args[hoursIdx + 1]) {
  hours = parseInt(args[hoursIdx + 1], 10);
  args.splice(hoursIdx, 2);
}

switch (cmd) {
  case "status":
    cmdStatus();
    break;
  case "active":
    cmdActive();
    break;
  case "pulse":
    cmdPulse(hours);
    break;
  case "drift":
    cmdDrift(hours);
    break;
  case "focus":
    if (!args[0]) {
      console.error("Usage: focus <name> [commitment]");
      process.exit(1);
    }
    cmdFocus(args[0], args.slice(1).join(" ") || undefined);
    break;
  case "explore":
    if (!args[0]) {
      console.error("Usage: explore <name> [note]");
      process.exit(1);
    }
    cmdExplore(args[0], args.slice(1).join(" ") || undefined);
    break;
  case "park":
    if (!args[0]) {
      console.error("Usage: park <name> [reason]");
      process.exit(1);
    }
    cmdPark(args[0], args.slice(1).join(" ") || undefined);
    break;
  case "kill":
    if (!args[0]) {
      console.error("Usage: kill <name> [reason]");
      process.exit(1);
    }
    cmdKill(args[0], args.slice(1).join(" ") || undefined);
    break;
  default:
    console.log(`Focus - Project State Tracker

Know what you're actually working on. Make conscious decisions.

COMMANDS:
  status              All project states
  active              Active projects only
  pulse               File activity in ~/things/ (last 24h)
  drift               Compare activity to focus - THE IMPORTANT ONE

  focus <name>        Mark as active focus (max 3)
  explore <name>      Mark as exploring (conscious)
  park <name>         Park it (conscious pause)
  kill <name>         Kill it (done/abandoned)

OPTIONS:
  --hours N           Look back N hours (default: 24)

EXAMPLES:
  drift               # Am I working on what I said I would?
  pulse --hours 48    # What did I touch in last 2 days?
  focus speakmac "Ship v2.8"
  park experiment "Works but not priority"
`);
}
