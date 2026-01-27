---
name: retro
description: Debug and analyze bot conversation failures, terminations, and stuck operations. Use when the bot dies unexpectedly.
metadata: {"clawdbot":{"emoji":"🔍","requires":{"bins":["jq","rg"]}}}
---

# retro - Conversation Retrospective & Debug

Analyze why the bot stopped responding, terminated, or got stuck. Use this skill when:
- Bot said "terminated" or went silent
- A task failed repeatedly
- You want to understand what happened in a conversation

## Quick Diagnosis

### 1. Find the relevant session

```bash
# List recent sessions by modification time (most recent first)
ls -lt ~/.clawdbot/agents/bob/sessions/*.jsonl | head -10

# Or find sessions from today
ls -la ~/.clawdbot/agents/bob/sessions/*.jsonl | grep "$(date +%b' '%d)"
```

### 2. Check for termination/errors

```bash
# Find the smoking gun - termination or error signals
SESSION=/path/to/session.jsonl
jq -r 'select(.message.stopReason == "error" or .message.errorMessage != null) | "\(.timestamp) | ERROR: \(.message.errorMessage // .message.stopReason)"' "$SESSION" | tail -5
```

### 3. Extract the error timeline

```bash
# Get last 20 messages leading to the error
jq -c 'select(.type=="message")' "$SESSION" | tail -20 | jq -r '"\(.timestamp | split("T")[1] | split(".")[0]) | \(.message.role) | \((.message.content[0].text // .message.content[0].name // .message.content[0].toolName // "...") | .[0:80])"'
```

## Common Failure Patterns

### Browser/Chrome Extension Issues

**Symptom:** "Chrome extension relay is running, but no tab is connected"

```bash
# Find all browser failures
jq -r 'select(.message.content[]?.details?.error? | contains("Chrome extension")) | .timestamp' "$SESSION"
```

**Fix:** Click the Clawdbot Chrome extension icon on any tab to reconnect.

### Tool Validation Failures

**Symptom:** "Validation failed for tool X: must have required property Y"

```bash
# Find validation errors
jq -r 'select(.message.content[]?.text? | contains("Validation failed")) | "\(.timestamp) | \(.message.content[0].text | split("\n")[0])"' "$SESSION"
```

**Cause:** Usually the LLM sent malformed tool arguments.

### Infinite Retry Loops

**Symptom:** Same tool called repeatedly with errors

```bash
# Count tool calls by name
jq -r '.message.content[]? | select(.type == "toolCall") | .name' "$SESSION" | sort | uniq -c | sort -rn | head -10
```

### Agent Termination

**Symptom:** "errorMessage":"terminated"

```bash
# Find exactly when termination happened
jq -r 'select(.message.errorMessage == "terminated") | "\(.timestamp) | TERMINATED | Last thinking: \(.message.content[0].thinking[0:100] // "none")"' "$SESSION"
```

## Full Debug Report

Run this to get a complete analysis:

```bash
SESSION=/path/to/session.jsonl
echo "=== Session Stats ==="
jq -s '{
  messages: length,
  user: [.[] | select(.message.role == "user")] | length,
  assistant: [.[] | select(.message.role == "assistant")] | length,
  toolResults: [.[] | select(.message.role == "toolResult")] | length,
  errors: [.[] | select(.message.isError == true or .message.stopReason == "error")] | length,
  first: .[0].timestamp,
  last: .[-1].timestamp
}' "$SESSION"

echo ""
echo "=== Tool Usage ==="
jq -r '.message.content[]? | select(.type == "toolCall") | .name' "$SESSION" | sort | uniq -c | sort -rn | head -10

echo ""
echo "=== Errors ==="
jq -r 'select(.message.isError == true or .message.stopReason == "error" or (.message.content[]?.details?.status? == "error")) | "\(.timestamp) | \((.message.content[0].text // .message.errorMessage // .message.content[0].details.error) | .[0:100])"' "$SESSION" | tail -10

echo ""
echo "=== Last 5 Messages ==="
jq -c 'select(.type=="message")' "$SESSION" | tail -5 | jq -r '"\(.timestamp | split("T")[1]) | \(.message.role) | \((.message.content[0].text // .message.content[0].thinking // .message.content[0].name // "tool") | .[0:60])..."'
```

## Escape Hatch Commands

### Built-in Abort Triggers (send via Telegram)

The bot recognizes these abort triggers - just send the word/command:

| Trigger | Effect |
|---------|--------|
| `/stop` | Native command to abort |
| `stop` | Abort trigger |
| `esc` | Abort trigger |
| `abort` | Abort trigger |
| `wait` | Abort trigger |
| `exit` | Abort trigger |
| `interrupt` | Abort trigger |

**Note:** These only work if the bot can still process messages. If the agent is completely stuck (not polling for new messages), use the restart methods below.

### Force Restart (from command line)

```bash
# Restart the gateway service (preferred)
launchctl kickstart -k gui/$(id -u)/com.clawdbot.gateway

# Or manually stop/start
launchctl stop gui/$(id -u)/com.clawdbot.gateway
launchctl start gui/$(id -u)/com.clawdbot.gateway

# Nuclear option - kill all clawdbot processes
pkill -f clawdbot
launchctl start gui/$(id -u)/com.clawdbot.gateway
```

### Clawdbot CLI Restart

```bash
# Using the clawdbot CLI
clawdbot gateway restart

# Or stop + start
clawdbot gateway stop
clawdbot gateway start
```

### Check if Bot is Responsive

```bash
# Check if gateway process is running
launchctl list | grep clawdbot

# Check recent logs for activity
tail -20 /tmp/clawdbot/clawdbot-$(date +%Y-%m-%d).log | jq -r '.timestamp' | tail -1

# See if there's an active Telegram run
curl -s http://127.0.0.1:18789/api/sessions | jq '.[] | select(.sessionKey | contains("telegram"))'
```

## Prevention Tips

1. **Chrome extension**: Keep a Chrome tab with the extension connected
2. **Timeouts**: Long browser operations should have explicit timeouts
3. **Fallbacks**: When browser fails, fall back to non-browser alternatives
4. **Heartbeat monitoring**: Check HEARTBEAT.md for stuck states

## Session Locations

- **Bob (Telegram):** `~/.clawdbot/agents/bob/sessions/`
- **Main:** `~/.clawdbot/agents/main/sessions/`
- **Session index:** `sessions.json` in each agent folder

## Quick One-liner

Get the last error from the most recent session:

```bash
LAST=$(ls -t ~/.clawdbot/agents/bob/sessions/*.jsonl | head -1)
jq -r 'select(.message.stopReason == "error" or .message.isError) | "\(.timestamp) | \(.message.errorMessage // .message.content[0].text)"' "$LAST" | tail -1
```
