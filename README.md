# Backend - Real-time Voice & Chat Agent with Appointment Booking

This backend provides an HTTP server and WebSocket gateway for a low-latency, full-duplex AI voice and chat agent system. It handles real-time speech-to-text transcription, LLM-based conversation, appointment booking with email confirmation and Google Calendar integration, user authentication, and manages complete conversation flow with silence detection and transcript storage.

## Features

### Core Functionality
- Express HTTP server with health check endpoint
- WebSocket server for bidirectional streaming of audio, transcripts, and agent responses
- Deepgram integration for real-time speech-to-text transcription
- OpenAI integration for streaming LLM responses (configured as hospital receptionist)
- Silence detection mechanism (5 seconds) for automatic transcript finalization
- Transcript accumulation and intelligent merging to prevent data loss
- Automatic LLM call triggering after silence detection
- Conversation history management for context-aware responses
- Conversation history persistence in MongoDB
- Full-duplex conversation support (user can interrupt agent)
- Dual interaction modes: Voice and Chat

### Authentication & Authorization
- Google OAuth 2.0 login flow for admin calendar access
- Email/phone-based user authentication (login and signup)
- Session management with browser session tracking
- Password hashing with bcrypt
- User session persistence

### Appointment Booking
- Interactive appointment booking flow via AI agent conversation
- Structured booking data extraction from LLM responses
- MongoDB booking records with full patient details
- Email confirmation for appointments (HTML templates)
- Google Calendar integration for scheduled appointments
- Automatic timezone detection and handling
- Calendar invite generation with Google Meet links
- Patient email added as calendar attendee

### Database & Storage
- MongoDB integration with Mongoose
- Conversation history storage
- Booking records storage
- User accounts storage
- Admin OAuth tokens storage (singleton pattern)
- Session tracking

## Tech Stack

### Core Framework
- Node.js
- Express 5 - HTTP server framework
- ws 8 - WebSocket server library
- cors 2 - Cross-origin resource sharing
- dotenv 17 - Environment variable management

### Database
- MongoDB - NoSQL database
- Mongoose 9 - MongoDB object modeling

### External Services
- @deepgram/sdk 4 - Deepgram speech-to-text SDK
- openai 6 - OpenAI API SDK
- googleapis 169 - Google Calendar API client
- nodemailer 7 - Email sending service
- bcryptjs 3 - Password hashing

### Development Tools
- nodemon 3 - Development server with auto-reload (dev dependency)

## Setup

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn package manager
- MongoDB instance (local or cloud)
- Deepgram API account and API key
- OpenAI API account and API key
- Google Cloud Platform account (for OAuth and Calendar API)
- Gmail account with App Password (for email sending)

### Installation

1. Install dependencies:

```bash
cd backend
npm install
```

2. Create a `.env` file in the `backend` directory:

```bash
# Core API Keys
DEEPGRAM_API_KEY=your-deepgram-api-key-here
OPENAI_API_KEY=your-openai-api-key-here

# Server Configuration
PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/voice_agent
MONGODB_DB=voice_agent

# Google OAuth (for Calendar integration)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# Email Configuration (Gmail SMTP)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
```

**Required Environment Variables:**
- `DEEPGRAM_API_KEY` - Your Deepgram API key for speech-to-text transcription
- `OPENAI_API_KEY` - Your OpenAI API key for LLM responses
- `MONGODB_URI` - MongoDB connection string (default: `mongodb://localhost:27017/voice_agent`)
- `MONGODB_DB` - MongoDB database name (default: `voice_agent`)
- `PORT` - Server port (default: 3001)

**Optional Environment Variables:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (required for calendar integration)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (required for calendar integration)
- `GOOGLE_REDIRECT_URI` - OAuth redirect URI (default: `http://localhost:3001/auth/google/callback`)
- `EMAIL_USER` - Gmail address for sending emails (required for email confirmations)
- `EMAIL_PASS` - Gmail App Password (required for email confirmations)
- `NODE_ENV` - Environment mode (`development` or `production`)

3. Set up Google OAuth (for Calendar integration):

   a. Go to [Google Cloud Console](https://console.cloud.google.com/)
   b. Create a new project or select existing project
   c. Enable Google Calendar API
   d. Create OAuth 2.0 credentials (Web application)
   e. Add authorized redirect URI: `http://localhost:3001/auth/google/callback` (development)
   f. Add authorized JavaScript origins: `http://localhost:3001` (development)
   g. Copy Client ID and Client Secret to `.env` file

4. Set up Gmail App Password (for email sending):

   a. Enable 2-Step Verification on your Google Account
   b. Go to Google Account > Security > App passwords
   c. Generate an app password for "Mail"
   d. Copy the app password to `EMAIL_PASS` in `.env` file

5. Run in development mode:

```bash
npm run dev
```

The server will run on `http://localhost:3001` (or the port specified in `.env`).

6. Run in production mode:

```bash
npm start
```

## Project Structure

```
backend/
├── server.js                          # Express app initialization, HTTP server, WebSocket server attachment
├── websocket.js                       # WebSocket server implementation, message handling, silence detection, LLM orchestration, booking flow
├── db.js                              # MongoDB connection management
│
├── models/
│   ├── User.js                        # User model (email/phone authentication)
│   ├── Admin.js                       # Admin model (singleton for OAuth tokens)
│   ├── Booking.js                     # Booking model (appointment records)
│   ├── ConversationEntry.js            # Conversation history model
│   └── Session.js                     # Browser session tracking model
│
├── services/
│   ├── deepgram.js                    # Deepgram streaming STT wrapper and event handling
│   ├── openai.js                      # OpenAI streaming chat completion wrapper with hospital receptionist system prompt
│   ├── tts.js                         # TTS service abstraction (placeholder)
│   ├── emailService.js                # Email sending service (appointment confirmations)
│   ├── googleCalendar.js             # Google Calendar API integration (meeting scheduling)
│   └── adminService.js                # Admin OAuth token management (singleton pattern)
│
├── routes/
│   ├── auth.js                        # Authentication routes (login/signup/OAuth)
│   └── calendar.js                    # Calendar routes (meeting scheduling endpoint)
│
├── config/
│   └── mailTransporter.js             # Nodemailer transporter configuration
│
├── templates/
│   └── appointmentConfirmationTemplate.js  # HTML email template for appointment confirmations
│
├── scripts/
│   ├── checkAdmin.js                  # Utility script to verify admin OAuth tokens
│   └── testScheduleMeeting.js         # Test script for calendar scheduling endpoint
│
├── package.json                       # Dependencies and scripts
├── .env                               # Environment variables (not committed)
└── README.md                          # This file
```

## Database Models

### User Model

Stores user accounts for email/phone authentication.

**Schema:**
- `email`: String (optional, unique, validated)
- `phone`: String (optional, unique, validated)
- `name`: String (optional)
- `passwordHash`: String (required, min 8 chars, bcrypt hashed)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**
- Unique index on `email` (sparse)
- Unique index on `phone` (sparse)

### Admin Model

Singleton model for storing Google OAuth tokens. There should always be exactly one admin record.

**Schema:**
- `email`: String (required, unique, validated)
- `name`: String (optional)
- `access_token`: String (required)
- `refresh_token`: String (optional)
- `token_expiry`: Date (optional)
- `tokens_updated_at`: Date (default: now)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**
- Unique index on `email`

**Pattern:** Singleton pattern enforced via `adminService.updateAdminTokens()` - always updates or creates single admin record.

### Booking Model

Stores appointment booking records created via AI agent conversation.

**Schema:**
- `browserSessionId`: String (required, indexed)
- `user`: ObjectId (optional, ref: User, indexed)
- `name`: String (required)
- `age`: Number (required, min: 0, max: 150)
- `contactNumber`: String (required)
- `medicalConcern`: String (required)
- `appointmentDateTime`: Date (required)
- `email`: String (optional)
- `doctorPreference`: String (optional)
- `status`: String (enum: ['pending', 'confirmed', 'failed'], default: 'confirmed')
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**
- Index on `browserSessionId` and `createdAt` (descending)

### ConversationEntry Model

Stores conversation history for each browser session.

**Schema:**
- `browserSessionId`: String (required, indexed)
- `user`: ObjectId (optional, ref: User, indexed)
- `mode`: String (enum: ['voice', 'chat'], required)
- `userText`: String (required)
- `agentText`: String (required)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**
- Compound index on `browserSessionId` and `createdAt` (ascending)

### Session Model

Tracks browser sessions and links them to user accounts.

**Schema:**
- `browserSessionId`: String (required, indexed)
- `user`: ObjectId (optional, ref: User, indexed)
- `metadata`: Object (default: {})
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**
- Unique compound index on `browserSessionId` and `user`

## Services

### Deepgram Service (`services/deepgram.js`)

Handles real-time speech-to-text transcription using Deepgram's live API.

**Configuration:**
- Model: `nova-2` (Deepgram's latest real-time model)
- Encoding: `linear16` (16-bit PCM)
- Sample Rate: `16000` Hz
- Channels: `1` (mono)
- Interim Results: `true` (enabled)
- Smart Format: `true` (enabled for punctuation and formatting)

**Interface:**
- `createDeepgramStream({ onTranscript, onError })`: Creates a live Deepgram connection
  - `onTranscript({ text, isFinal })`: Called when transcript is received
  - `onError(err)`: Called on Deepgram connection errors
- `write(audioBuffer)`: Sends PCM16 audio buffer to Deepgram
- `close()`: Closes the Deepgram connection

**Note:** The backend ignores Deepgram's `isFinal` flag and uses its own silence-based finalization logic.

### OpenAI Service (`services/openai.js`)

Handles streaming LLM responses using OpenAI's chat completion API.

**Configuration:**
- Model: `gpt-4o-mini` (cost-effective, fast response)
- Temperature: `0.7` (balanced creativity and consistency)
- Max Tokens: `500` (keeps responses concise for voice interaction)
- Streaming: `true` (enabled for real-time token delivery)

**System Prompt:**
The OpenAI integration uses a detailed system prompt that configures the AI as a hospital receptionist. The AI is instructed to:
- Greet patients warmly and professionally
- Listen to concerns and symptoms
- Collect appointment information (name, contact, date/time, reason, doctor preference)
- Be empathetic and understanding
- Keep responses concise and natural for voice conversation
- Follow a strict 6-phase conversation flow:
  1. Greeting
  2. Medical Concern
  3. Appointment Timing
  4. Patient Details Collection
  5. Confirmation
  6. Booking Action (JSON output)
- Output structured JSON payload after user confirmation
- Never mention implementation details to users

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

### Email Service (`services/emailService.js`)

Sends appointment confirmation emails using Nodemailer and Gmail SMTP.

**Configuration:**
- Service: Gmail SMTP
- Authentication: Gmail App Password (not regular password)
- From: `"Hospital Appointments" <EMAIL_USER>`

**Interface:**
- `sendAppointmentConfirmationEmail(appointmentData)`: Sends confirmation email
  - `appointmentData`: Object with booking details (name, age, contactNumber, medicalConcern, appointmentDateTime, email, doctorPreference)
  - Returns: `{ success: true, messageId }` on success
  - Throws error on failure

**Email Template:**
- HTML email template generated by `templates/appointmentConfirmationTemplate.js`
- Includes patient details, appointment date/time, medical concern, doctor preference
- Professional formatting with styling

### Google Calendar Service (`services/googleCalendar.js`)

Handles Google Calendar operations using stored OAuth refresh token.

**Features:**
- Automatic token refresh using stored refresh token
- Timezone-aware event scheduling
- Google Meet link generation
- Attendee management

**Interface:**
- `getCalendarClient()`: Gets authenticated Google Calendar API client
  - Uses refresh token from admin record
  - Automatically refreshes access token when needed
  - Throws error if admin record or refresh token missing

- `scheduleMeeting({ summary, description, startDateTime, endDateTime, timezone, calendarId, attendees })`: Schedules calendar event
  - `summary`: Event title
  - `description`: Event description
  - `startDateTime`: ISO 8601 datetime string (e.g., `'2025-12-24T12:00:00+05:30'`)
  - `endDateTime`: ISO 8601 datetime string
  - `timezone`: IANA timezone name (e.g., `'Asia/Kolkata'`)
  - `calendarId`: Calendar ID (default: `'primary'`)
  - `attendees`: Array of email addresses (optional)
  - Returns: `{ eventId, meetingLink, start, end, htmlLink, summary }`
  - Throws error on failure

- `formatAppointmentDateTime(appointmentDateTime, timezone)`: Formats appointment datetime for calendar
  - Extracts date and time from appointment datetime
  - Uses current year (not year from appointment datetime)
  - Converts UTC datetime to target timezone's local time
  - Adds 30 minutes to start time for end time
  - Returns: `{ startDateTime, endDateTime }` in ISO 8601 format

- `getTimezoneOffset(timezone, date)`: Calculates timezone offset in ISO 8601 format
  - Supports IANA timezone names and UTC offsets
  - Uses Intl API for accurate offset calculation
  - Includes fallback mapping for common timezones

### Admin Service (`services/adminService.js`)

Manages the singleton admin record and Google OAuth tokens.

**Pattern:** Singleton pattern - ensures there's always exactly one admin record.

**Interface:**
- `getAdmin()`: Gets the admin record (singleton)
  - Returns: Admin document or null if not found

- `updateAdminTokens({ email, name, access_token, refresh_token, token_expiry })`: Updates or creates admin with OAuth tokens
  - Implements singleton pattern: ensures there's always exactly one admin record
  - Deletes any duplicate admin records (safety check)
  - Returns: Updated admin document

- `hasValidTokens()`: Checks if admin tokens are valid (not expired)
  - Returns: Boolean

- `getAccessToken()`: Gets admin access token
  - Returns: Access token string or null

## Routes

### Authentication Routes (`routes/auth.js`)

**POST /api/auth/signup**
- Creates a new user account
- Body: `{ email?, phone?, name?, password, browser_session_id? }`
- Validates email/phone format and password length
- Hashes password with bcrypt
- Creates user record in database
- Links browser session to user account
- Returns: `{ user: { id, email, phone, name }, browser_session_id }`

**POST /api/auth/login**
- Authenticates user with email/phone and password
- Body: `{ email?, phone?, password, browser_session_id? }`
- Validates credentials
- Compares password hash
- Links browser session to user account
- Returns: `{ user: { id, email, phone, name }, browser_session_id }`

**GET /auth/google**
- Initiates Google OAuth 2.0 flow
- Redirects to Google's consent screen
- Requests scopes: calendar, userinfo.email, userinfo.profile
- Requires `access_type=offline` and `prompt=consent` to get refresh token

**GET /auth/google/callback**
- Handles OAuth callback from Google
- Exchanges authorization code for access token and refresh token
- Fetches user info from Google (email, name)
- Stores tokens in singleton admin record via `adminService.updateAdminTokens()`
- Redirects to frontend root (`/`)

### Calendar Routes (`routes/calendar.js`)

**POST /schedule-meeting**
- Schedules a Google Calendar meeting using stored refresh token
- No user authentication required - uses admin's stored refresh token
- Body (optional - uses defaults if not provided):
  ```json
  {
    "summary": "Test Appointment",
    "description": "Booked via backend API",
    "startDateTime": "2025-12-24T12:00:00+05:30",
    "endDateTime": "2025-12-24T12:30:00+05:30",
    "timezone": "Asia/Kolkata",
    "calendarId": "primary"
  }
  ```
- Validates datetime format (ISO 8601)
- Validates end time is after start time
- Returns: `{ success: true, eventId, meetingLink, start, end, htmlLink, summary }`
- Error response: `{ success: false, error: "Error message" }`

### Conversation History Route (`server.js`)

**GET /api/conversations/:sessionId**
- Fetches conversation history for a browser session
- Path parameter: `sessionId` - the `browser_session_id` value
- Returns conversation entries sorted by creation date
- Filters out agent responses containing curly braces (JSON fragments)
- Returns: `{ session_id: "...", entries: [...] }`
- Each entry: `{ timestamp, transcript, llm_response, browser_session_id, mode, user_id }`

### Booking Route (`server.js`)

**POST /book-appointment**
- Creates a booking record from structured JSON payload
- Body:
  ```json
  {
    "action": "book_appointment",
    "payload": {
      "name": "...",
      "age": 27,
      "contact_number": "...",
      "medical_concern": "...",
      "appointment_datetime": "2023-12-24T12:30:00.000Z",
      "email": "...",
      "doctor_preference": "..."
    },
    "metadata": {
      "browser_session_id": "...",
      "timezone": "Asia/Kolkata"
    }
  }
  ```
- Validates required fields
- Creates booking record in database
- Sends confirmation email if email provided
- Schedules Google Calendar meeting if email sent successfully
- Uses timezone from metadata for calendar scheduling
- Returns: `{ success: true, bookingId, booking }`

**Note:** This route is primarily used for HTTP-based booking. WebSocket-based bookings are handled in `websocket.js`.

## WebSocket Protocol

All WebSocket messages use JSON format with a consistent structure:

```json
{
  "type": "message_type",
  "payload": {},
  "metadata": {}
}
```

When used from the browser client, the `metadata` object automatically includes session information:

```json
{
  "metadata": {
    "browser_session_id": "2e1f3f2a-2a1f-4e0f-9f4c-7a3c0d1e9b2c",
    "conversation_session_id": "user:userId:sessionId" | "guest:sessionId",
    "user_id": "userId" | null,
    "user_type": "user" | "guest",
    "timezone": "Asia/Kolkata"
  }
}
```

The `browser_session_id` is stable across page refreshes within a tab and different for each browser tab/window. The `timezone` is automatically detected from the browser and used for calendar scheduling.

### Client to Server Messages

**start_recording**
- Initiates audio recording and starts Deepgram stream
- No payload required
- Server responds with `status` message with `state: "listening"`

**stop_recording**
- Stops audio recording and closes Deepgram stream
- No payload required
- Server responds with `status` message with `state: "idle"`
- If transcript exists, triggers LLM call

**audio_chunk**
- Sends audio data from client microphone
- `payload.audio`: base64-encoded PCM16 16kHz mono audio frame
- Sent continuously while recording is active

**chat_message**
- Sends text message in chat mode
- `payload.text`: text message string
- Triggers backend LLM processing immediately
- Server responds with `status` message with `state: "thinking"`

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

### Voice Mode Flow

1. **Client Connection**
   - Client connects to WebSocket endpoint (same host/port as HTTP server)
   - Server extracts `browser_session_id` and `timezone` from metadata
   - Server resolves user account linked to browser session
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
   - Server detects if response contains booking JSON payload

8. **Booking Detection & Processing**
   - If LLM response contains booking JSON payload:
     - Server suppresses streaming of JSON to UI
     - Server sends user-friendly message: "Please wait, your appointment booking is in progress."
     - Server parses booking payload
     - Server creates booking record in database
     - Server sends confirmation email if email provided
     - Server schedules Google Calendar meeting if email sent successfully
     - Server sends success message to user
     - Server sends calendar confirmation message if calendar scheduled

9. **LLM Response Completion**
   - When OpenAI stream completes:
     - Server adds assistant response to `conversationHistory`
     - Server saves conversation turn to database
     - Server sends `status` message with `state: "speaking"` (for TTS indication)
     - Server resets transcript state (`pendingTranscript`, `lastSentTranscript`)
     - Server resets `llmCallPending` flag
     - Server sends `status` message with `state: "idle"`
   - Frontend triggers TTS to read out the complete agent response

10. **Interruption Handling**
    - Client can send `interrupt` message at any time
    - Server cancels current LLM and TTS streams
    - Server resets state to allow new utterance
    - Server sends `status` message with `state: "interrupted"`

11. **Stop Recording**
    - Client sends `stop_recording` message
    - Server closes Deepgram stream
    - Server clears silence detection intervals
    - Server finalizes any pending transcript (triggers LLM call if transcript exists)
    - Server sends `status` message with `state: "idle"`

### Chat Mode Flow

1. **Client Connection** (same as voice mode)

2. **Send Message**
   - Client sends `chat_message` with text payload
   - Server immediately triggers LLM call (no silence detection)
   - Server adds user message to conversation history
   - Server sends `status` message with `state: "thinking"`

3. **LLM Response Streaming** (same as voice mode steps 7-9)

4. **Booking Detection & Processing** (same as voice mode step 8)

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

## Booking Flow

### Booking Detection

The LLM is configured to output a structured JSON payload after user confirms appointment details:

```json
{
  "action": "book_appointment",
  "payload": {
    "name": "John Doe",
    "age": 27,
    "contact_number": "9970758021",
    "medical_concern": "headache and fever",
    "appointment_datetime": "2023-12-24T12:30:00.000Z",
    "email": "john@example.com",
    "doctor_preference": "Dr. Smith"
  }
}
```

The server detects booking JSON in LLM responses using heuristics:
- Checks if response starts with `{`
- Looks for `"action": "book_appointment"` pattern
- Validates JSON structure

### Booking Processing

When booking JSON is detected:

1. **Suppress JSON Streaming**
   - Server suppresses streaming of JSON tokens to UI
   - Server sends user-friendly message: "Please wait, your appointment booking is in progress."

2. **Parse & Validate**
   - Server parses JSON payload
   - Validates required fields (name, age, contact_number, medical_concern, appointment_datetime)
   - Validates appointment datetime format

3. **Create Booking Record**
   - Server creates booking record in MongoDB
   - Links booking to browser session and user (if authenticated)
   - Sets status to `'confirmed'`

4. **Send Email Confirmation**
   - If email is provided:
     - Server sends HTML confirmation email using `emailService`
     - Email includes all appointment details
     - Uses professional HTML template

5. **Schedule Calendar Meeting**
   - Only if email was sent successfully:
     - Server formats appointment datetime for calendar (uses current year, adds 30 mins)
     - Server uses timezone from metadata (or defaults to Asia/Kolkata)
     - Server creates Google Calendar event with:
       - Summary: "Hospital Appointment - [Patient Name]"
       - Description: Formatted appointment details
       - Google Meet link (auto-generated)
       - Patient email as attendee
     - Server sends calendar invite to patient email

6. **User Feedback**
   - Server sends success message to user
   - If email sent: "I've also sent a confirmation email..."
   - If calendar scheduled: "Great! I've also scheduled your appointment in your calendar..."

### Error Handling

- Booking creation errors: Logged, user receives error message
- Email sending errors: Logged, booking still successful, calendar not scheduled
- Calendar scheduling errors: Logged, booking and email still successful

## Google OAuth Integration

### OAuth Flow

1. **Initiation** (`GET /auth/google`)
   - User clicks "Sign in with Google" on frontend
   - Frontend redirects to backend `/auth/google`
   - Backend redirects to Google's OAuth consent screen
   - Requests scopes: calendar, userinfo.email, userinfo.profile
   - Requires `access_type=offline` and `prompt=consent` to get refresh token

2. **Callback** (`GET /auth/google/callback`)
   - Google redirects back with authorization code
   - Backend exchanges code for access token and refresh token
   - Backend fetches user info (email, name) from Google
   - Backend stores tokens in singleton admin record
   - Backend redirects to frontend root

### Token Storage

- Tokens stored in `Admin` model (singleton pattern)
- Only one admin record exists in database
- New OAuth flows update the same admin record
- Refresh token used for automatic token renewal

### Token Usage

- Calendar API uses refresh token to authenticate
- Access token automatically refreshed when expired
- No user login required for calendar operations
- Admin tokens used for all calendar scheduling

## Calendar Integration

### Timezone Handling

- Frontend automatically detects user's timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Timezone included in all WebSocket messages via metadata
- Backend uses timezone for proper calendar event scheduling
- Supports IANA timezone names (e.g., `America/New_York`, `Asia/Kolkata`)
- Fallback to UTC offset if IANA detection fails

### Event Creation

- Event summary: "Hospital Appointment - [Patient Name]"
- Event description: Formatted appointment details matching email template
- Start/end time: Formatted using user's timezone
- Duration: 30 minutes (automatically calculated)
- Google Meet link: Auto-generated
- Attendees: Patient email added as attendee
- Calendar invites: Sent to attendees automatically

### Date/Time Formatting

- Input: UTC datetime from LLM (e.g., `2023-12-24T02:30:00.000Z`)
- Conversion: Converts to user's timezone local time
- Year: Always uses current year (not year from input)
- Output: ISO 8601 format with timezone offset (e.g., `2025-12-24T08:00:00+05:30`)

## Email Service

### Configuration

- Service: Gmail SMTP
- Authentication: Gmail App Password (required, not regular password)
- From: `"Hospital Appointments" <EMAIL_USER>`
- Template: HTML email template with professional styling

### Email Content

- Subject: "Your Appointment Is Confirmed"
- Body: HTML formatted with:
  - Patient name greeting
  - Appointment details table
  - Date and time (formatted nicely)
  - Medical concern
  - Doctor preference (if provided)
  - Contact information
  - Professional footer

### Error Handling

- Email errors logged but don't fail booking
- Calendar scheduling only proceeds if email sent successfully
- User receives feedback on email status

## Logging

The backend uses structured JSON logging for all events. Log format:

```json
{
  "ts": "2025-12-22T13:15:02.599Z",
  "ctx": "ws|deepgram|openai|auth|calendar|email",
  "msg": "event_name",
  "additional_fields": "values"
}
```

**Key Log Events:**

**WebSocket:**
- `client_connected`: WebSocket client connected
- `start_recording_received`: Recording started
- `audio_chunk_received`: Audio chunk received (logged occasionally)
- `transcript_accumulated`: Transcript updated (logged occasionally)
- `silence_threshold_reached`: 5 seconds of silence detected
- `processing_transcript_for_llm`: About to make LLM call
- `llm_call_initiated`: LLM call started
- `llm_response_complete`: LLM response finished
- `conversation_turn_saved`: Conversation saved to database
- `booking_created`: Booking record created
- `attempting_calendar_schedule`: Calendar scheduling started
- `formatted_datetime_for_calendar`: Datetime formatted for calendar
- `calendar_meeting_scheduled`: Calendar meeting scheduled successfully
- `calendar_schedule_failed`: Calendar scheduling failed
- `client_disconnected`: WebSocket client disconnected

**Authentication:**
- OAuth token exchange logs
- User info fetch logs
- Token storage logs

**Email:**
- Email sent successfully
- Email send failures

**Calendar:**
- Meeting scheduled successfully
- Calendar API errors

**Console Output:**
- "Make LLM call" message is printed to console when LLM call is triggered (with transcript preview)

## Error Handling

### Missing API Keys

- If `DEEPGRAM_API_KEY` is not set, Deepgram stream creation returns a no-op object (writes are ignored)
- If `OPENAI_API_KEY` is not set, LLM stream returns a fake message indicating configuration is needed
- Both cases log warnings to console

### WebSocket Errors

- Connection errors are logged with structured format
- Message parse errors are caught and logged
- Client disconnection triggers cleanup of all streams and state
- Invalid message types are ignored

### Stream Errors

- Deepgram errors are forwarded to `onError` callback and logged
- OpenAI errors are caught, logged, and conversation turn is saved with error message
- All streams support cancellation via `cancel()` method

### Database Errors

- Connection errors are logged and thrown
- Model validation errors are caught and returned as error responses
- Duplicate key errors are handled gracefully

### Booking Errors

- Booking creation errors: Logged, user receives error message via WebSocket
- Email sending errors: Logged, booking still successful, calendar not scheduled
- Calendar scheduling errors: Logged, booking and email still successful

### OAuth Errors

- Missing OAuth credentials: Returns error response
- Token exchange failures: Redirects to login page with error parameter
- User info fetch failures: Tries fallback endpoint, then redirects with error
- Missing refresh token: Returns error when trying to use calendar API

## Development

### Development Server

```bash
npm run dev
```

Uses `nodemon` to automatically restart server on file changes.

### Production Server

```bash
npm start
```

Runs server without auto-reload.

### Testing Scripts

**Check Admin OAuth Tokens:**
```bash
node scripts/checkAdmin.js
```

Verifies admin record exists and displays token status.

**Test Calendar Scheduling:**
```bash
node scripts/testScheduleMeeting.js
```

Tests the `/schedule-meeting` endpoint with default values.

### Testing Deepgram

A standalone test script is available at `test-deepgram.js`:
```bash
node test-deepgram.js
```

This script tests Deepgram integration independently of the main application.

## Architecture Notes

### State Management

- Each WebSocket connection maintains its own state (isolated per client)
- State includes: Deepgram stream, LLM stream, TTS stream, conversation history, recording status, silence detection state, booking suppression flag
- State is cleaned up on client disconnect
- Browser session ID extracted from metadata and used for conversation persistence

### Transcript Accumulation

- Uses intelligent merging algorithm to handle Deepgram's incremental transcripts
- Prevents data loss by prioritizing longer transcripts and appending non-overlapping segments
- Handles corrections and updates gracefully
- Tracks last sent transcript to prevent duplicate UI updates

### Silence Detection

- Transcript-based (more accurate than audio-based)
- Prevents false positives from background noise
- Includes buffer period to capture final transcript updates
- Monitors transcript growth to detect if user is still speaking

### LLM Call Optimization

- Only triggers after confirmed silence (5 seconds + buffer)
- Prevents duplicate calls with `llmCallPending` flag
- Cancels pending calls if user starts speaking again
- Ensures complete transcript is captured before LLM call
- Chat mode triggers immediately (no silence detection)

### Booking Flow

- Detects booking JSON in LLM responses using heuristics
- Suppresses JSON streaming to UI for better UX
- Processes booking asynchronously to avoid blocking
- Provides user feedback at each step
- Handles errors gracefully without failing booking

### Singleton Admin Pattern

- Ensures only one admin record exists in database
- New OAuth flows update the same admin record
- Automatic cleanup of duplicate records
- Used for calendar API authentication

### Timezone Handling

- Frontend detects timezone automatically
- Timezone included in all WebSocket messages
- Backend uses timezone for calendar scheduling
- Supports IANA timezone names with fallback
- Accurate timezone offset calculation using Intl API

## API Endpoints Summary

### HTTP Endpoints

- `GET /health` - Health check endpoint
- `GET /api/conversations/:sessionId` - Get conversation history
- `POST /book-appointment` - Create booking (HTTP)
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `POST /schedule-meeting` - Schedule calendar meeting

### WebSocket Endpoints

- `ws://localhost:3001` - WebSocket connection for real-time communication

## Environment Variables Reference

### Required

- `DEEPGRAM_API_KEY` - Deepgram API key
- `OPENAI_API_KEY` - OpenAI API key
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB` - MongoDB database name

### Optional

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment mode
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_REDIRECT_URI` - OAuth redirect URI
- `EMAIL_USER` - Gmail address for sending emails
- `EMAIL_PASS` - Gmail App Password

## Troubleshooting

### WebSocket Connection Issues

- Verify backend server is running on correct port
- Check CORS configuration
- Verify WebSocket URL matches server port

### Deepgram Transcription Issues

- Verify `DEEPGRAM_API_KEY` is set correctly
- Check Deepgram account quota
- Verify audio format (PCM16, 16kHz, mono)

### OpenAI LLM Issues

- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI account quota
- Verify API key has chat completion permissions

### Calendar Scheduling Issues

- Verify Google OAuth is completed (`node scripts/checkAdmin.js`)
- Check Google Calendar API is enabled
- Verify refresh token exists in admin record
- Check calendar permissions

### Email Sending Issues

- Verify `EMAIL_USER` and `EMAIL_PASS` are set correctly
- Use Gmail App Password (not regular password)
- Enable 2-Step Verification on Google Account
- Check Gmail sending limits

### Database Connection Issues

- Verify MongoDB is running
- Check `MONGODB_URI` is correct
- Verify database name exists
- Check network connectivity

## License

This project is part of a larger application. Refer to the main project repository for license information.
