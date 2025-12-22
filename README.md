# Backend - Real-time Voice Agent

This backend provides an HTTP server and WebSocket gateway for a low-latency, full-duplex voice agent system. It handles real-time speech-to-text transcription, LLM-based conversation, and manages the complete conversation flow with silence detection and transcript storage.

## Features

- Express HTTP server with health check endpoint
- WebSocket server for bidirectional streaming of audio, transcripts, and agent responses
- Deepgram integration for real-time speech-to-text transcription
- OpenAI integration for streaming LLM responses (configured as hospital receptionist)
- Silence detection mechanism (5 seconds) for automatic transcript finalization
- Transcript accumulation and intelligent merging to prevent data loss
- Automatic LLM call triggering after silence detection
- Conversation history management for context-aware responses
- Transcript storage to JSONL file (transcripts.jsonl)
- Full-duplex conversation support (user can interrupt agent)

## Tech Stack

- Node.js
- Express - HTTP server framework
- ws - WebSocket server library
- cors - Cross-origin resource sharing
- dotenv - Environment variable management
- nodemon - Development server with auto-reload (dev dependency)
- @deepgram/sdk - Deepgram speech-to-text SDK
- openai - OpenAI API SDK

## Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Create a `.env` file in the backend directory (this file is not committed to version control):

```bash
DEEPGRAM_API_KEY=your-deepgram-api-key-here
OPENAI_API_KEY=your-openai-api-key-here
PORT=3001
```

**Required Environment Variables:**
- `DEEPGRAM_API_KEY` - Your Deepgram API key for speech-to-text transcription
- `OPENAI_API_KEY` - Your OpenAI API key for LLM responses
- `PORT` - Server port (default: 3001)

3. Run in development mode:

```bash
npm run dev
```

The server will run on `http://localhost:3001` (or the port specified in `.env`).

4. Run in production mode:

```bash
npm start
```

## Folder Structure

```
backend/
├── server.js              # Express app initialization, HTTP server, WebSocket server attachment
├── websocket.js           # WebSocket server implementation, message handling, silence detection, LLM orchestration
├── services/
│   ├── deepgram.js       # Deepgram streaming STT wrapper and event handling
│   ├── openai.js         # OpenAI streaming chat completion wrapper with hospital receptionist system prompt
│   └── tts.js            # TTS service abstraction (placeholder for future implementation)
├── transcripts.jsonl     # JSONL file storing all transcripts and LLM responses (auto-generated)
├── test-deepgram.js      # Standalone test script for Deepgram integration
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (not committed, create from .env.example)
└── README.md             # This file
```

## WebSocket Protocol

All WebSocket messages use JSON format with a consistent structure:

```json
{
  "type": "message_type",
  "payload": {}
}
```

### Client to Server Messages

**start_recording**
- Initiates audio recording and starts Deepgram stream
- No payload required
- Server responds with `status` message with `state: "listening"`

**stop_recording**
- Stops audio recording and closes Deepgram stream
- No payload required
- Server responds with `status` message with `state: "idle"`

**audio_chunk**
- Sends audio data from client microphone
- `payload.audio`: base64-encoded PCM16 16kHz mono audio frame
- Sent continuously while recording is active

**interrupt**
- Indicates user barge-in (user starts speaking while agent is responding)
- Cancels in-flight LLM/TTS streams and resets state
- No payload required
- Server responds with `status` message with `state: "interrupted"`

### Server to Client Messages

**transcript**
- Sends transcription results from Deepgram
- `payload.text`: transcript text (accumulated and merged)
- `payload.isFinal`: boolean indicating if this is a final transcript (currently always false for interim results)
- Sent continuously as user speaks, showing real-time transcript accumulation

**agent_text**
- Streams LLM response tokens to client
- `payload.token`: individual text token from streaming LLM response
- `payload.clear`: boolean (optional) - when true, clears previous agent response in UI
- Sent token-by-token as OpenAI streams the response

**agent_audio**
- Streams TTS audio chunks (currently placeholder)
- `payload.audio`: base64-encoded audio chunk for immediate playback
- Note: TTS is currently implemented on frontend using OpenAI TTS API

**status**
- Indicates current connection/processing state
- `payload.state`: one of `"connected" | "listening" | "thinking" | "speaking" | "idle" | "interrupted" | "error"`
- `payload.error`: optional error code string (when state is "error")

## Streaming Flow

1. **Client Connection**
   - Client connects to WebSocket endpoint (same host/port as HTTP server)
   - Server sends `status` message with `state: "connected"`

2. **Start Recording**
   - Client sends `start_recording` message
   - Server creates Deepgram live stream connection
   - Server initializes silence detection mechanism
   - Server sends `status` message with `state: "listening"`

3. **Audio Streaming**
   - Client captures microphone audio and resamples to PCM16 16kHz mono
   - Client sends `audio_chunk` messages continuously with base64-encoded audio
   - Server forwards audio chunks to Deepgram stream

4. **Transcript Generation**
   - Deepgram processes audio and emits transcript events
   - Server accumulates transcripts intelligently (merging, deduplicating, appending)
   - Server sends `transcript` messages to client with `isFinal: false` for real-time display
   - Server tracks `lastTranscriptTime` for silence detection

5. **Silence Detection**
   - Server runs periodic check (every 100ms) for silence
   - Silence is detected when no new transcripts arrive for 5 seconds (`SILENCE_THRESHOLD_MS = 5000`)
   - When silence threshold is reached:
     - Server sets `llmCallPending` flag to prevent duplicate calls
     - Server waits additional buffer period (1.5 seconds) to capture final transcript updates
     - Server monitors if transcript is still updating (user still speaking)
     - If transcript stabilizes, proceeds to LLM call

6. **LLM Call Trigger**
   - Server prints "Make LLM call" to console with transcript preview
   - Server adds user message to `conversationHistory`
   - Server sends `status` message with `state: "thinking"`
   - Server sends `agent_text` message with `clear: true` to clear previous response in UI
   - Server cancels any in-flight LLM/TTS streams

7. **LLM Response Streaming**
   - Server creates OpenAI streaming chat completion with conversation history
   - OpenAI streams tokens back to server
   - Server forwards each token to client via `agent_text` messages
   - Client displays tokens in real-time

8. **LLM Response Completion**
   - When OpenAI stream completes:
     - Server adds assistant response to `conversationHistory`
     - Server saves transcript and LLM response to `transcripts.jsonl` file
     - Server sends `status` message with `state: "speaking"` (for TTS indication)
     - Server resets transcript state (`pendingTranscript`, `lastSentTranscript`)
     - Server resets `llmCallPending` flag
     - Server sends `status` message with `state: "idle"`
   - Frontend triggers TTS to read out the complete agent response

9. **Interruption Handling**
   - Client can send `interrupt` message at any time
   - Server cancels current LLM and TTS streams
   - Server resets state to allow new utterance
   - Server sends `status` message with `state: "interrupted"`

10. **Stop Recording**
    - Client sends `stop_recording` message
    - Server closes Deepgram stream
    - Server clears silence detection intervals
    - Server finalizes any pending transcript (triggers LLM call if transcript exists)
    - Server sends `status` message with `state: "idle"`

## Silence Detection Mechanism

The backend uses transcript-based silence detection rather than audio-chunk-based detection for improved accuracy. This approach only considers actual speech transcripts, ignoring background noise or silent audio chunks.

**Key Components:**
- `SILENCE_THRESHOLD_MS`: 5000 milliseconds (5 seconds)
- `FINAL_TRANSCRIPT_BUFFER_MS`: 1500 milliseconds (1.5 seconds)
- `lastTranscriptTime`: Timestamp of last received transcript
- `silenceCheckInterval`: Periodic check running every 100ms

**Process:**
1. Silence detection starts when recording begins
2. Each new transcript resets `lastTranscriptTime`
3. Periodic check calculates time since last transcript
4. When 5 seconds of silence is detected:
   - System waits additional buffer period to capture final transcript updates
   - Monitors if transcript is still growing (user still speaking)
   - Only triggers LLM call when transcript is stable

**Transcript Accumulation:**
- Deepgram sends incremental transcripts (full transcripts that update)
- Server intelligently merges transcripts:
  - Prioritizes longer transcripts (more complete)
  - Appends non-overlapping segments
  - Handles corrections and updates
  - Prevents duplicate content
- Accumulated transcript is stored in `pendingTranscript` variable
- Transcript is sent to UI continuously for real-time display

## Transcript Storage

All transcripts and LLM responses are automatically saved to `transcripts.jsonl` in JSONL format (one JSON object per line). Each entry contains:

```json
{
  "timestamp": "2025-12-22T13:15:02.599Z",
  "transcript": "User's spoken text",
  "llm_response": "Agent's response text"
}
```

**File Location:** `backend/transcripts.jsonl`

**When Saved:**
- After LLM response completes successfully
- After LLM error (with error message in `llm_response` field)

**Format:** JSONL (JSON Lines) - each line is a valid JSON object, making it easy to append and parse

## Deepgram Integration

**File:** `services/deepgram.js`

**Configuration:**
- Model: `nova-2` (Deepgram's latest real-time model)
- Encoding: `linear16` (16-bit PCM)
- Sample Rate: `16000` Hz
- Channels: `1` (mono)
- Interim Results: `true` (enabled)
- Smart Format: `true` (enabled for punctuation and formatting)

**Interface:**
- `createDeepgramStream({ onTranscript, onError })`: Creates a live Deepgram connection
- `write(audioBuffer)`: Sends PCM16 audio buffer to Deepgram
- `close()`: Closes the Deepgram connection

**Events:**
- `onTranscript({ text, isFinal })`: Called when transcript is received
  - `text`: Transcript text (full transcript, not incremental)
  - `isFinal`: Boolean indicating if Deepgram marked it as final
- `onError(err)`: Called on Deepgram connection errors

**Note:** The backend ignores Deepgram's `isFinal` flag and uses its own silence-based finalization logic.

## OpenAI Integration

**File:** `services/openai.js`

**Configuration:**
- Model: `gpt-4o-mini` (cost-effective, fast response)
- Temperature: `0.7` (balanced creativity and consistency)
- Max Tokens: `500` (keeps responses concise for voice interaction)
- Streaming: `true` (enabled for real-time token delivery)

**System Prompt:**
The OpenAI integration uses a detailed system prompt that configures the AI as a hospital receptionist. The AI is instructed to:
- Greet patients warmly
- Listen to concerns and symptoms
- Collect appointment information (name, contact, date/time, reason, doctor preference)
- Be empathetic and understanding
- Keep responses concise and natural for voice conversation
- Confirm details before finalizing

**Interface:**
- `createOpenAIStream({ messages, onToken, onComplete, onError })`: Creates streaming chat completion
  - `messages`: Array of conversation history messages (`{ role: "user"|"assistant"|"system", content: "..." }`)
  - `onToken(token)`: Called for each streaming token
  - `onComplete(fullText)`: Called when stream completes with full response
  - `onError(err)`: Called on API errors
- Returns object with `cancel()` method for interruption

**Conversation History:**
- System prompt is automatically prepended to conversation history
- User messages are added when transcripts are finalized
- Assistant messages are added after LLM response completes
- History persists for the duration of the WebSocket connection

## TTS Service

**File:** `services/tts.js`

**Current Status:** Placeholder implementation

The TTS service is currently a placeholder that simulates streaming audio chunks. The actual TTS is implemented on the frontend using OpenAI's TTS API for better performance and lower latency.

**Future Implementation:**
- Can be replaced with OpenAI TTS, ElevenLabs, or other TTS providers
- Should implement `createTTSStream({ text, onAudioChunk, onEnd })` with real audio generation
- Should return object with `cancel()` method for interruption

## Logging

The backend uses structured JSON logging for all events. Log format:

```json
{
  "ts": "2025-12-22T13:15:02.599Z",
  "ctx": "ws|deepgram|openai",
  "msg": "event_name",
  "additional_fields": "values"
}
```

**Key Log Events:**
- `client_connected`: WebSocket client connected
- `start_recording_received`: Recording started
- `audio_chunk_received`: Audio chunk received (logged occasionally)
- `transcript_accumulated`: Transcript updated (logged occasionally)
- `silence_threshold_reached`: 5 seconds of silence detected
- `processing_transcript_for_llm`: About to make LLM call
- `llm_call_initiated`: LLM call started
- `llm_response_complete`: LLM response finished
- `transcript_saved_to_file`: Transcript saved to file
- `client_disconnected`: WebSocket client disconnected

**Console Output:**
- "Make LLM call" message is printed to console when LLM call is triggered (with transcript preview)

## Development

**Development Server:**
```bash
npm run dev
```
Uses `nodemon` to automatically restart server on file changes.

**Production Server:**
```bash
npm start
```
Runs server without auto-reload.

**Testing Deepgram:**
A standalone test script is available at `test-deepgram.js`:
```bash
node test-deepgram.js
```
This script tests Deepgram integration independently of the main application.

## Error Handling

**Missing API Keys:**
- If `DEEPGRAM_API_KEY` is not set, Deepgram stream creation returns a no-op object (writes are ignored)
- If `OPENAI_API_KEY` is not set, LLM stream returns a fake message indicating configuration is needed
- Both cases log warnings to console

**WebSocket Errors:**
- Connection errors are logged with structured format
- Message parse errors are caught and logged
- Client disconnection triggers cleanup of all streams and state

**Stream Errors:**
- Deepgram errors are forwarded to `onError` callback and logged
- OpenAI errors are caught, logged, and transcript is saved with error message
- All streams support cancellation via `cancel()` method

## Architecture Notes

**State Management:**
- Each WebSocket connection maintains its own state (isolated per client)
- State includes: Deepgram stream, LLM stream, TTS stream, conversation history, recording status, silence detection state
- State is cleaned up on client disconnect

**Transcript Accumulation:**
- Uses intelligent merging algorithm to handle Deepgram's incremental transcripts
- Prevents data loss by prioritizing longer transcripts and appending non-overlapping segments
- Handles corrections and updates gracefully

**Silence Detection:**
- Transcript-based (more accurate than audio-based)
- Prevents false positives from background noise
- Includes buffer period to capture final transcript updates
- Monitors transcript growth to detect if user is still speaking

**LLM Call Optimization:**
- Only triggers after confirmed silence (5 seconds + buffer)
- Prevents duplicate calls with `llmCallPending` flag
- Cancels pending calls if user starts speaking again
- Ensures complete transcript is captured before LLM call
