#!/usr/bin/env bash
set -euo pipefail

# Gemini Audio Transcription
# Uses Gemini's multimodal API to transcribe audio files

usage() {
  cat >&2 <<'EOF'
Usage:
  transcribe.sh <audio-file>

Outputs transcript to stdout.
EOF
  exit 2
}

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
fi

in="${1:-}"

if [[ ! -f "$in" ]]; then
  echo "File not found: $in" >&2
  exit 1
fi

# Use GEMINI_API_KEY or NANOBANANA_GEMINI_API_KEY
API_KEY="${GEMINI_API_KEY:-${NANOBANANA_GEMINI_API_KEY:-}}"
if [[ -z "$API_KEY" ]]; then
  echo "Missing GEMINI_API_KEY or NANOBANANA_GEMINI_API_KEY" >&2
  exit 1
fi

# Detect mime type (audio and video)
case "${in##*.}" in
  # Audio formats
  ogg|oga) MIME="audio/ogg" ;;
  mp3) MIME="audio/mp3" ;;
  wav) MIME="audio/wav" ;;
  m4a) MIME="audio/mp4" ;;
  webm) MIME="audio/webm" ;;
  flac) MIME="audio/flac" ;;
  # Video formats
  mp4) MIME="video/mp4" ;;
  mov) MIME="video/quicktime" ;;
  avi) MIME="video/x-msvideo" ;;
  mkv) MIME="video/x-matroska" ;;
  wmv) MIME="video/x-ms-wmv" ;;
  *) MIME="audio/ogg" ;;
esac

# Base64 encode the audio file
AUDIO_B64=$(base64 -i "$in" | tr -d '\n')

# Call Gemini API (Flash 3)
response=$(curl -sS "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "contents": [{
    "parts": [
      {"text": "Transcribe this audio accurately. Output ONLY the transcription, nothing else. No explanations, no formatting, just the spoken words."},
      {
        "inline_data": {
          "mime_type": "${MIME}",
          "data": "${AUDIO_B64}"
        }
      }
    ]
  }],
  "generationConfig": {
    "temperature": 0,
    "maxOutputTokens": 8192
  }
}
EOF
)

# Extract text from response
text=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
    for part in parts:
        if 'text' in part:
            print(part['text'].strip())
            break
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null)

if [[ -z "$text" ]]; then
  echo "Transcription failed: $response" >&2
  exit 1
fi

echo "$text"
