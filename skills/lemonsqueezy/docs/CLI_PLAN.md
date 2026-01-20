# CLI Development Plan for Speakmac Agent

**Goal:** Make the Speakmac Telegram agent fully capable of accessing all business data via CLI tools.

## Current State

### MCP Servers in vibe-code/mcp-servers:
| Server | Tools | Status | CLI Needed? |
|--------|-------|--------|-------------|
| ga4-analytics | 11 tools | Configured | **YES** |
| lemonsqueezy | 8 tools | Configured | **YES** |
| gmail | - | Configured (external) | NO - use `gog` |
| google-ads | 11 tools | NOT configured | Maybe later |

### Existing Clawdbot Skills (reuse these):
| Skill | Purpose | Use Case |
|-------|---------|----------|
| `gog` | Gmail/Calendar/Drive/Sheets | Email, scheduling |
| `bird` | Twitter/X | Social monitoring |
| `github` | GitHub CLI | Code/issues |

## Strategy: Don't Reinvent the Wheel

1. **Gmail** → Use existing `gog` skill
2. **GA4** → Create new `ga4` CLI
3. **LemonSqueezy** → Create new `ls` CLI
4. **Google Ads** → Defer (not critical for Speakmac ops)

---

## CLI #1: `ls` (LemonSqueezy)

### Commands
```bash
# Revenue overview
ls overview                    # Total revenue, 30-day revenue, sales count
ls revenue [--period 30d]      # Revenue breakdown

# Orders
ls orders [--limit 20]         # Recent orders
ls orders --status paid        # Filter by status
ls order <number>              # Lookup by order number
ls order --email foo@bar.com   # Lookup by customer email
ls refunds [--limit 20]        # Refunded orders

# Subscriptions
ls subs                        # All subscriptions with MRR
ls subs --status active        # Filter by status
ls mrr                         # MRR breakdown by product

# Customers
ls customers [--limit 20]      # Customer list with LTV
ls customer <email>            # Customer lookup

# Products
ls products                    # All products with stats
```

### Implementation Notes
- Auth: `LEMONSQUEEZY_API_KEY` env var
- Output: JSON by default, `--pretty` for formatted
- Source: Direct API calls (no MCP dependency)

---

## CLI #2: `ga4` (Google Analytics 4)

### Commands
```bash
# Overview
ga4 overview [--period 30d]    # Users, sessions, events, engagement
ga4 realtime                   # Active users right now

# Events & Funnels
ga4 events [--limit 50]        # Event counts
ga4 funnel onboarding          # Onboarding completion
ga4 funnel transcription       # Transcription success rate
ga4 funnel permissions         # Permission grants

# Errors
ga4 errors [--type all]        # Error analysis
ga4 errors --type transcription

# Growth & Retention
ga4 growth [--period 30d]      # DAU/WAU/MAU, new installs
ga4 retention [--period 30d]   # User retention

# Transcription metrics
ga4 transcriptions [--period 7d]           # Transcription stats
ga4 transcriptions --by provider           # By provider
ga4 transcriptions --by day                # Daily breakdown

# Version adoption
ga4 versions [--period 14d]    # App version adoption

# Custom query
ga4 query --dimensions "date,eventName" --metrics "eventCount"
```

### Implementation Notes
- Auth: Service account JSON via `GOOGLE_APPLICATION_CREDENTIALS`
- Config: `GA4_PROPERTY_ID`, `GA4_MEASUREMENT_ID`
- Source: `@google-analytics/data` SDK

---

## File Structure

```
skills/
├── lemonsqueezy/
│   ├── SKILL.md           # Usage docs
│   ├── docs/
│   │   └── API_REFERENCE.md
│   └── src/
│       └── cli.ts         # TypeScript CLI
│
├── ga4/
│   ├── SKILL.md           # Usage docs
│   ├── docs/
│   │   └── API_REFERENCE.md
│   └── src/
│       └── cli.ts         # TypeScript CLI
```

---

## Updated System Prompt Strategy

Once CLIs are built, update Bob's system prompt to:

```markdown
## DATA ACCESS - PRIORITY ORDER

### 1. CLI Tools (preferred - fast, scriptable)
- **ls**: LemonSqueezy revenue/orders/subscriptions
- **ga4**: GA4 analytics, events, funnels
- **gog**: Gmail, Calendar, Drive, Sheets
- **bird**: Twitter/X

### 2. Direct API (fallback)
If CLI fails, use curl with env vars from SECRETS.env
```

---

## Implementation Order

1. **ls CLI** - Revenue is most frequently asked
2. **ga4 CLI** - Analytics second most common
3. **Update system prompt** - Point agent to new tools
4. **Test with Bob** - Validate in Telegram group

---

## Conventions (from existing skills)

Based on `gog` and `bird` patterns:

- **Install**: `brew install steipete/tap/<name>` or `npm install -g @steipete/<name>`
- **Auth**: Env vars, config file, or CLI flags
- **Output**: JSON default, `--pretty` for human-readable
- **Help**: Built-in `--help` for all commands
- **Config**: `~/.config/<name>/config.json5`
- **Errors**: Exit code 1 + stderr message
