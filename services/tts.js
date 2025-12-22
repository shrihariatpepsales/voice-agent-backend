/**
 * Text-to-Speech service abstraction.
 *
 * For now, this implements a placeholder that simulates streaming audio chunks.
 * Replace the internals of createTTSStream with provider-specific logic
 * (e.g. OpenAI TTS, ElevenLabs, etc.).
 */
function createTTSStream({ text, onAudioChunk, onEnd }) {
  // TODO: Replace this with real TTS provider integration.
  // This placeholder just emits an empty "audio" chunk and then ends.

  const cancelled = { value: false };

  // Simulate async streaming behavior
  setTimeout(() => {
    if (cancelled.value) return;

    // In a real implementation, `audioChunk` would be raw PCM or encoded audio.
    const fakeAudioChunk = Buffer.from(`AUDIO:${text}`); // placeholder
    if (onAudioChunk) {
      onAudioChunk(fakeAudioChunk);
    }

    if (onEnd) {
      onEnd();
    }
  }, 10);

  return {
    cancel() {
      cancelled.value = true;
    },
  };
}

module.exports = {
  createTTSStream,
};


