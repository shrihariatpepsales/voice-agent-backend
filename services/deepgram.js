const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Create a streaming Deepgram STT connection.
 *
 * This module hides the provider details and exposes a simple, event-based interface:
 * - Call `write(audioBuffer)` with raw PCM16 16kHz mono audio.
 * - Receive partial/final transcripts via the `onTranscript` callback.
 * - Call `close()` to end the stream.
 */
function createDeepgramStream({ onTranscript, onError }) {
  if (!DEEPGRAM_API_KEY) {
    console.warn('[deepgram] DEEPGRAM_API_KEY not set. STT will be disabled.');
    return {
      write: () => {},
      close: () => {},
    };
  }

  const deepgram = createClient(DEEPGRAM_API_KEY);

  // Create a live transcription connection.
  // CRITICAL: Deepgram requires explicit audio format specification.
  // Without encoding/sample_rate/channels, Deepgram cannot process the audio.
  const live = deepgram.listen.live({
    model: 'nova-2',
    encoding: 'linear16',      // 16-bit PCM encoding
    sample_rate: 16000,        // 16kHz sample rate
    channels: 1,                // Mono channel
    interim_results: true,
    smart_format: true,
  });

  // Connection lifecycle events
  live.on(LiveTranscriptionEvents.Open, () => {
    console.log('[deepgram] live connection opened');
  });

  live.on(LiveTranscriptionEvents.Error, (err) => {
    // Deepgram will surface auth/model/permission issues here.
    // Log a highly visible, structured error so it's obvious when
    // the key or model (e.g. nova-2) is not allowed on this account.
    console.error(
      '[deepgram] error',
      {
        message: err && err.message ? err.message : String(err),
        raw: err,
      }
    );
    if (onError) onError(err);
  });

  live.on(LiveTranscriptionEvents.Close, (event) => {
    console.log('[deepgram] live connection closed', event || '');
  });

  // Transcript events (interim + final)
  live.on(LiveTranscriptionEvents.Transcript, (dgResponse) => {
    try {
      const channel = dgResponse.channel;
      if (!channel || !channel.alternatives || !channel.alternatives.length) return;

      const alt = channel.alternatives[0];
      const text = alt.transcript || '';
      if (!text) return;

      const isFinal = dgResponse.is_final === true;

      // DO NOT log transcripts here - they will be logged only after 5s silence
      // Our system ignores Deepgram's isFinal flag and only finalizes after 5s of audio silence

      if (onTranscript) {
        onTranscript({ text, isFinal });
      }
    } catch (err) {
      console.error('[deepgram] parse_error', err);
    }
  });

  return {
    /**
     * Write raw PCM16 audio to the Deepgram stream.
     * @param {Buffer} audioBuffer
     */
    write(audioBuffer) {
      if (!live) {
        console.warn('[deepgram] write() called but live stream is not available');
        return;
      }
      try {
        live.send(audioBuffer);
      } catch (err) {
        console.error('[deepgram] error sending audio', { error: err.message, raw: err });
      }
    },

    /**
     * Close the Deepgram live stream.
     */
    close() {
      try {
        live.finish();
      } catch (err) {
        console.error('[deepgram] error closing stream', err);
      }
    },
  };
}

module.exports = {
  createDeepgramStream,
};


