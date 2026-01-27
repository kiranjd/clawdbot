---
name: gemini-transcribe
description: Transcribe audio and video using Gemini's multimodal API.
homepage: https://ai.google.dev/gemini-api/docs/audio
metadata: {"clawdbot":{"emoji":"🎧","requires":{"bins":["curl","python3"],"env":["GEMINI_API_KEY"]},"primaryEnv":"GEMINI_API_KEY"}}
---

# Gemini Media Transcription

Transcribe audio and video files using Gemini Flash 3's multimodal capabilities.

## Quick start

```bash
{baseDir}/scripts/transcribe.sh /path/to/audio.ogg
{baseDir}/scripts/transcribe.sh /path/to/video.mp4
```

## Supported formats

**Audio:** mp3, ogg, wav, m4a, webm, flac
**Video:** mp4, mov, avi, mkv, wmv

## API key

Set `GEMINI_API_KEY` or `NANOBANANA_GEMINI_API_KEY` in environment.

## Notes

- Uses gemini-3-flash-preview model
- Fast and accurate transcription
- Outputs plain text to stdout
