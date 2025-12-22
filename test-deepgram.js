// Simple Deepgram live transcription sanity check.
// Run with:
//   cd backend
//   node -r dotenv/config test-deepgram.js
//
// This does not use your frontend/audio pipeline. It just opens a
// Deepgram live stream, sends a second of silent PCM16 audio, and
// logs any transcripts or errors so you can verify that your
// DEEPGRAM_API_KEY and model are correctly configured.

const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('[test-deepgram] DEEPGRAM_API_KEY is not set in environment');
    process.exit(1);
  }

  const client = createClient(apiKey);

  const live = client.listen.live({
    // Use the same model you configured in services/deepgram.js.
    // If your account does not have access to this model, you will
    // see a clear error printed from the Error handler below.
    model: 'nova-2',
    encoding: 'linear16',      // 16-bit PCM encoding
    sample_rate: 16000,        // 16kHz sample rate
    channels: 1,                // Mono channel
    interim_results: true,
    smart_format: true,
  });

  live.on(LiveTranscriptionEvents.Open, () => {
    console.log('[test-deepgram] live connection opened');

    // Send ~1 second of silence as 16‑bit PCM at 16kHz.
    // Deepgram will still treat this as valid audio and may emit
    // empty/near-empty transcripts, but if there are auth/model
    // issues, they will show up in the Error handler.
    const sampleRate = 16000;
    const seconds = 1;
    const frameCount = sampleRate * seconds;
    const buffer = Buffer.alloc(frameCount * 2); // int16 little-endian, all zeros = silence

    live.send(buffer);

    // Finish the stream after sending the buffer
    live.finish();
  });

  live.on(LiveTranscriptionEvents.Transcript, (data) => {
    console.log(
      '[test-deepgram] transcript event',
      JSON.stringify(data, null, 2)
    );
  });

  live.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('[test-deepgram] error', {
      message: err && err.message ? err.message : String(err),
      raw: err,
    });
  });

  live.on(LiveTranscriptionEvents.Close, (event) => {
    console.log('[test-deepgram] connection closed', event || '');
  });
}

main().catch((err) => {
  console.error('[test-deepgram] fatal error', err);
  process.exit(1);
});


