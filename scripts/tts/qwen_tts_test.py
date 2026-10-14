"""Planning/config tests require only Python's standard library, never MLX or model weights."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
import qwen_tts as tts


class CourseVoiceTests(unittest.TestCase):
    def setUp(self):
        self.document = json.loads((Path(__file__).parent / "voices.json").read_text())

    def test_default_german_cast_paths_and_aliases_are_preserved(self):
        cast = tts.select_course_cast(self.document)
        self.assertEqual(cast["voices"], self.document["voices"])
        self.assertEqual(cast["language"], "german")
        self.assertEqual(tts.resolve_voice(cast, "Evidence"), ("narrator", None, "narrator"))
        self.assertEqual(tts.resolve_voice(cast, "stimme"), ("elise", "bandpass", "stimme"))
        self.assertEqual(tts.course_paths(cast), (tts.REPO / "web/public/audio/dialogue", tts.REPO / "art/source/voices"))

    def test_legacy_custom_cast_without_course_config_still_works(self):
        legacy = {key: self.document[key] for key in ("language", "aliases", "voices")}
        cast = tts.select_course_cast(legacy)
        self.assertEqual(cast["voices"], legacy["voices"])
        self.assertTrue(cast["legacyPaths"])
        jobs = tts.normalize_jobs([{"clipId": "legacy-clip", "speaker": "otto", "german": "Guten Morgen!"}], cast)
        self.assertEqual(jobs[0]["text"], "Guten Morgen!")
        self.assertEqual(tts.sha(jobs[0]["text"], "reference-hash", .7, "32k"), tts.sha(jobs[0]["german"], "reference-hash", .7, "32k"))

    def test_english_selects_teacher_and_isolates_clip_and_reference_directories(self):
        english = self.document["courses"]["english"]
        for selector in ("english", "en", english["id"]):
            cast = tts.select_course_cast(self.document, selector)
            self.assertEqual(cast["language"], "english")
            self.assertEqual(cast["locale"], "en-GB")
            self.assertEqual(tts.resolve_voice(cast, "sam"), ("teacher", None, "teacher"))
            self.assertEqual(set(cast["voices"]), {"teacher"})
            self.assertEqual(tts.course_paths(cast), (tts.REPO / "web/public/audio/courses" / english["id"], tts.REPO / "art/source/voices/english"))

    def test_canonical_text_wins_and_wrong_course_jobs_are_rejected(self):
        cast = tts.select_course_cast(self.document, "english")
        jobs = tts.normalize_jobs([{"clipId": "sentence-uuid", "speaker": "sam", "text": "Hello!", "german": "Wrong old value", "courseId": cast["id"]}], cast)
        self.assertEqual(jobs[0]["text"], "Hello!")
        with self.assertRaisesRegex(SystemExit, "another course"):
            tts.normalize_jobs([{"clipId": "a", "speaker": "sam", "text": "Hello!", "courseId": self.document["courses"]["german"]["id"]}], cast)
        with self.assertRaisesRegex(SystemExit, "nonempty text"):
            tts.normalize_jobs([{"clipId": "a", "speaker": "sam", "text": "", "german": "Do not silently replace empty canonical text"}], cast)
        with self.assertRaisesRegex(SystemExit, "unknown course"):
            tts.select_course_cast(self.document, "not-a-course")

    def test_cli_english_dry_run_loads_no_models_and_creates_no_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            jobs = root / "jobs.json"
            jobs.write_text(json.dumps([{"clipId": "proof-sentence-uuid", "speaker": "sam", "text": "Your ticket, please."}]))
            out, voices = root / "clips", root / "references"
            result = subprocess.run([sys.executable, str(Path(tts.__file__)), "--jobs", str(jobs), "--course", "english", "--dry-run", "--out", str(out), "--voices-dir", str(voices)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("target en, synthesis language english", result.stdout)
            self.assertIn("sam->teacher", result.stdout)
            self.assertIn("Your ticket, please.", result.stdout)
            self.assertFalse(out.exists())
            self.assertFalse(voices.exists())


if __name__ == "__main__":
    unittest.main()
