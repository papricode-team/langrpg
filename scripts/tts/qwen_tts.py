#!/usr/bin/env python3
"""Local German TTS with distinct character voices (Qwen3-TTS via mlx-audio).

Workflow: VoiceDesign creates ONE reference clip per character from a text
description (art/source/voices/<speaker>.wav + .txt); the Base model then clones
that reference for every line so each character sounds the same everywhere.

Usage:
  ~/.cache/lantern-tts/venv/bin/python scripts/tts/qwen_tts.py --jobs jobs.json
See scripts/tts/README.md.
"""
import argparse, hashlib, json, re, subprocess, sys, tempfile, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DESIGN_REPO = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"
CLONE_REPO = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
CACHE_NAME = ".qwen-tts-cache.json"
SR = 24000


def log(*a):
    print(*a, flush=True)


def sha(*parts):
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode())
        h.update(b"\0")
    return h.hexdigest()[:16]


def ffmpeg_to_mp3(src_wav, dst_mp3, effect=None, bitrate="32k"):
    """Trim silence, optional effect, loudnorm, mono 24 kHz MP3 (32 kbps keeps speech clear within the audio budget)."""
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,"
            "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse")
    norm = "loudnorm=I=-18:TP=-1.5:LRA=11"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src_wav)]
    if effect == "bandpass":
        # old crackly recording: telephone band-pass, light saturation, faint noise
        cmd += ["-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.012:sample_rate={SR}:seed=7"]
        fc = (f"[0:a]{trim},highpass=f=350,lowpass=f=3000,acrusher=bits=10:mode=lin:mix=0.35,"
              "equalizer=f=1200:t=q:w=1:g=4,apad=pad_dur=0.2[v];"
              f"[v][1:a]amix=inputs=2:duration=first:normalize=0,{norm}[o]")
        cmd += ["-filter_complex", fc, "-map", "[o]"]
    elif effect:
        raise SystemExit(f"unknown effect {effect}")
    else:
        cmd += ["-af", f"{trim},{norm}"]
    cmd += ["-ac", "1", "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", bitrate, str(dst_mp3)]
    subprocess.run(cmd, check=True)


def write_wav(path, audio, sr):
    import numpy as np, soundfile as sf
    sf.write(str(path), np.asarray(audio, dtype="float32").reshape(-1), sr)


def generate_audio(model, **kw):
    import numpy as np
    chunks, ntok, proc = [], 0, 0.0
    for r in model.generate(**kw):
        chunks.append(np.asarray(r.audio, dtype="float32").reshape(-1))
        ntok += r.token_count
        proc += r.processing_time_seconds
    return np.concatenate(chunks), proc


def resolve_voice(cast, speaker):
    """Return (voice_name, effect) for a story speaker name."""
    name = cast.get("aliases", {}).get(speaker, speaker)
    v = cast["voices"].get(name) or cast["voices"].get(name.lower())
    if v is None:
        raise SystemExit(f"speaker '{speaker}' is not in the cast ({sorted(cast['voices'])})")
    name = name if name in cast["voices"] else name.lower()
    if "sameVoiceAs" in v:
        return v["sameVoiceAs"], v.get("effect"), name
    return name, None, name


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--jobs", required=True, help="JSON array of {clipId, speaker, german}")
    ap.add_argument("--cast", default=str(REPO / "scripts/tts/voices.json"))
    ap.add_argument("--out", default=str(REPO / "web/public/audio/dialogue"))
    ap.add_argument("--voices-dir", default=str(REPO / "art/source/voices"))
    ap.add_argument("--cache", help="skip-cache JSON path (default: <out>/%s)" % CACHE_NAME)
    ap.add_argument("--only", help="regex on clipId")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--redesign", action="append", default=[], metavar="SPEAKER",
                    help="re-create this speaker's reference clip (repeatable); regenerates its lines")
    ap.add_argument("--temperature", type=float, default=0.7, help="clone sampling temperature")
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--bitrate", default="32k", help="MP3 bitrate for the output clips")
    a = ap.parse_args()

    cast = json.loads(Path(a.cast).read_text())
    lang = cast.get("language", "german")
    jobs = json.loads(Path(a.jobs).read_text())
    if a.only:
        rx = re.compile(a.only)
        jobs = [j for j in jobs if rx.search(j["clipId"])]
    if a.limit:
        jobs = jobs[: a.limit]
    out = Path(a.out); vdir = Path(a.voices_dir)
    cache_file = Path(a.cache) if a.cache else out / CACHE_NAME
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}

    # resolve speakers
    plan = []
    for j in jobs:
        voice, effect, castname = resolve_voice(cast, j["speaker"])
        plan.append((j, voice, effect))
    redesign = set(a.redesign)
    needed = sorted({v for _, v, _ in plan} | {r for r in redesign if r in cast["voices"]})
    for r in redesign:
        if r not in cast["voices"]:
            raise SystemExit(f"--redesign: unknown speaker {r}")

    def ref_paths(v):
        return vdir / f"{v}.wav", vdir / f"{v}.txt"

    def voice_hash(v, effect):
        w, t = ref_paths(v)
        if w.exists() and t.exists():
            return sha(w.read_bytes(), t.read_text(), effect or "", CLONE_REPO)
        return sha("pending", v, json.dumps(cast["voices"][v], sort_keys=True), effect or "")

    todo = []
    for j, v, effect in plan:
        mp3 = out / f"{j['clipId']}.mp3"
        h = sha(j["german"], voice_hash(v, effect), a.temperature, a.bitrate)
        redo = v in redesign or j["speaker"] in redesign
        if mp3.exists() and cache.get(j["clipId"]) == h and not redo:
            continue
        todo.append((j, v, effect, h))
    to_design = [v for v in needed if v in redesign or not all(p.exists() for p in ref_paths(v))]
    log(f"{len(jobs)} jobs, {len(todo)} to synthesize, voices to design: {to_design or 'none'}")
    if a.dry_run:
        for j, v, e, _ in todo:
            log(f"  would synth {j['clipId']} [{j['speaker']}->{v}{'+'+e if e else ''}] {j['german'][:60]}")
        return

    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    from mlx_audio.utils import load_audio
    vdir.mkdir(parents=True, exist_ok=True); out.mkdir(parents=True, exist_ok=True)

    if to_design:
        log(f"loading VoiceDesign model {DESIGN_REPO}")
        dm = load_model(DESIGN_REPO)
        for v in to_design:
            spec = cast["voices"][v]
            mx.random.seed(a.seed)
            t0 = time.time()
            audio, _ = generate_audio(dm, text=spec["referenceText"], instruct=spec["description"],
                                      lang_code=lang, temperature=0.8, max_tokens=1500)
            w, t = ref_paths(v)
            write_wav(w, audio, dm.sample_rate)
            t.write_text(spec["referenceText"] + "\n")
            log(f"  designed {v}: {len(audio)/dm.sample_rate:.1f}s audio in {time.time()-t0:.1f}s -> {w}")
        del dm
        mx.clear_cache()

    if not todo:
        log("nothing to synthesize"); return

    log(f"loading clone model {CLONE_REPO}")
    cm = load_model(CLONE_REPO)
    refs = {}
    for v in {v for _, v, _, _ in todo}:
        w, t = ref_paths(v)
        refs[v] = (load_audio(str(w), sample_rate=cm.sample_rate), t.read_text().strip())

    tot_audio = tot_time = 0.0
    for i, (j, v, effect, h) in enumerate(todo, 1):
        mx.random.seed(a.seed)
        t0 = time.time()
        ra, rt = refs[v]
        audio, _ = generate_audio(cm, text=j["german"], ref_audio=ra, ref_text=rt, lang_code=lang,
                                  temperature=a.temperature, max_tokens=2000)
        dur = len(audio) / cm.sample_rate
        mp3 = out / f"{j['clipId']}.mp3"
        mp3.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / "raw.wav"
            write_wav(wav, audio, cm.sample_rate)
            ffmpeg_to_mp3(wav, mp3, effect, a.bitrate)
        el = time.time() - t0
        tot_audio += dur; tot_time += el
        cache[j["clipId"]] = sha(j["german"], voice_hash(v, effect), a.temperature, a.bitrate)  # recomputed: reference may have just been designed
        cache_file.write_text(json.dumps(cache, indent=1, sort_keys=True))
        log(f"[{i}/{len(todo)}] {j['clipId']} ({j['speaker']}) {dur:.1f}s audio in {el:.1f}s (RTF {el/max(dur,1e-6):.2f})")
    log(f"done: {tot_audio:.0f}s audio in {tot_time:.0f}s (RTF {tot_time/max(tot_audio,1e-6):.2f})")


if __name__ == "__main__":
    main()
