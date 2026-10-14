# Local course character TTS (Qwen3-TTS, design-then-clone)

`qwen_tts.py` renders dialogue lines to `<clipId>.mp3` fully offline on Apple Silicon.

1. **VoiceDesign** (`mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit`) turns the English `description` in `voices.json` into one reference clip per character: `art/source/voices/<speaker>.wav` + `<speaker>.txt` (exact transcript). Done once; commit these files so voices stay stable.
2. **Base** (`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit`) clones that reference (ICL mode: `ref_audio` + `ref_text`) for every line, so a character sounds identical across hundreds of lines.
3. ffmpeg trims silence, loudness-normalises (loudnorm I=-18, TP=-1.5), mono 24 kHz, libmp3lame 32 kbps (`--bitrate`; 32k keeps the distribution within its 80 MB audio budget).

`stimme` reuses Elise's reference and adds a band-pass/bit-crush/pink-noise "old recording" filter. Story speaker `Evidence` maps to `narrator` (`aliases` in `voices.json`).

The default cast and all existing German commands, reference paths and cache hashes remain unchanged. `voices.json` also declares course sets: German inherits the original cast, and English has one teacher voice, with `sam` mapped to that voice. `--course english` (also `en` or the configured course UUID) selects the English synthesis language and isolated output/reference directories.

The English proof currently plays browser speech synthesis using its `en-GB` course configuration. No English reference clips or Qwen recordings have been generated in this implementation. The teacher set prepares the optional authored-clip pipeline; its voice still needs generation and listening review before production use.

## Setup (once)

```sh
uv venv --python 3.12 ~/.cache/lantern-tts/venv
source ~/.cache/lantern-tts/venv/bin/activate
uv pip install mlx-audio soundfile numpy      # mlx-audio 0.5.8 tested
brew install ffmpeg                           # needs libmp3lame
```
Weights download on first run to the default Hugging Face cache (~5.1 GB total; the two repos share a 0.7 GB speech tokenizer). If downloads stall, set `HF_HUB_DISABLE_XET=1` and keep the machine awake.

## Run

```sh
~/.cache/lantern-tts/venv/bin/python scripts/tts/qwen_tts.py --jobs jobs.json
# jobs.json: [{"clipId":"otto-greeting-1","speaker":"otto","german":"Guten Morgen!"}, ...]

# Canonical jobs use text and sentence UUIDs; this planning command loads no models.
python3 scripts/tts/qwen_tts.py --course english --jobs english-jobs.json --dry-run
# english-jobs.json: [{"clipId":"<sentence UUID>","speaker":"sam","text":"Hello!","courseId":"4b081b02-2807-54c6-ab7e-669cebe73405"}]
```

Canonical `text` takes precedence over legacy `german`. An explicitly supplied job course must match the selected course. Non-German defaults are `web/public/audio/courses/<course UUID>/<clipId>.mp3` and `art/source/voices/<course>/<voice>.wav` plus its transcript. `--out` and `--voices-dir` override these paths. A course's `language` is passed to both VoiceDesign and Base; `locale` documents the intended pronunciation. Placeholder sentences need authored name-free or personalized job text, as they do in the German workflow.
Options: `--out DIR` (German default `web/public/audio/dialogue`), `--only REGEX` (on clipId), `--limit N`, `--dry-run`, `--redesign SPEAKER` (re-create the reference and regenerate that voice's lines; repeatable), `--temperature` (default 0.7), `--seed`.

Skipping: a hidden `.qwen-tts-cache.json` in `--out` stores sha256(text, reference wav+txt, effect, clone repo, temperature) per clip; a clip is re-rendered only if the mp3 is missing or the hash changed. Editing a reference wav/txt or a line therefore regenerates exactly the affected clips. Changing `description` alone does nothing until you `--redesign` that speaker.

## Add a character

Add an entry to the selected course's `voices` set (`description` in English, asking for clear speech in that course's target language; `referenceText` = 2-3 neutral target-language sentences, ~8-10 s) and run the tool with any job for that speaker. The legacy German cast remains at the top level. Listen to the course's reference WAV; if unhappy, tweak the description and run with `--redesign <voice name>` (the sampling seed is fixed, change `--seed` for a different take). Alias a story name with `aliases`, or derive a variant with `sameVoiceAs` + `effect`.

Cheap validation: `python3 scripts/tts/qwen_tts_test.py` checks cast selection, canonical/legacy job handling, course isolation and the dry-run CLI without MLX, downloads or synthesis. The measurements below describe the previous German run; they are not measurements of the new English voice.

## Measured on M2 Max / 32 GB / macOS 15.6 (mlx-audio 0.5.8)

| item | value |
|---|---|
| Weights on disk | Base-8bit 2.9 GB + VoiceDesign-8bit 2.2 GB (shared 0.7 GB tokenizer hard-linked) = 5.1 GB; venv 0.36 GB |
| Peak RAM | ~3.4 GB RSS (clone phase) |
| Clone speed | RTF ~0.8-1.1 for typical lines (about real time; first clip per speaker is slower, ~1.7-4x, due to warm-up/reference encoding) |
| Voice design | ~3-11 s per 8-12 s reference |
| Load time | a few seconds per model once cached |
| Throughput | 200 hours of audio is not practical in one go; ~1 minute of audio per ~1 minute of compute (hundreds of short lines per hour) |

Quality check (36 sample clips, 11 voices): all clips non-silent (mean about -18 to -21 dBFS after loudnorm, peaks below -1.5 dB), durations plausible (10-20 chars/s), and an ASR round-trip (Qwen3-ASR 0.6B) recovered every test sentence exactly, apart from "Lindenhafen" being heard as "Lindenhaven" for most voices. Reference clips were transcribed correctly except a few proper nouns (Voss heard as "Foss") and minor punctuation. No truncation observed. Short single-sentence clips can end up quieter than -18 LUFS because loudnorm runs single-pass; raise `-b:a` or switch to two-pass if that matters.

## Other models considered

Base-8bit was chosen over 0.6B for stability of identity; 0.6B-Base-8bit (`mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit`) is a drop-in smaller/faster alternative (change `CLONE_REPO`). Fallback if quality ever disappoints: Chatterbox Multilingual (MIT, German) via mlx-audio.
