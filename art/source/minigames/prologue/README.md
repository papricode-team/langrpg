# Night train art

The compartment, dining car, furniture sheet, sounds window and conductor expressions were generated with ImageGen on 2026-10-17. Briefs are beside the source paintings. `node scripts/prepare-prologue-art.mjs` exports the room paintings, sounds window, 16 furniture/prop frames and two noun frames without replacing alpha. The conductor uses the existing character-kit bake pipeline. Dawn lighting is a renderer overlay over the compartment's fixed geometry.

The ticket's pale/dark frames follow supported name practice. No microphone recording or pronunciation scoring is implied. Qwen3-TTS generates the conductor's dialogue and letter recognition cues; `scripts/generate-train-audio.mjs` synthesizes the train foley without external samples.
