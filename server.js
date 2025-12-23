require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { initWebSocketServer } = require('./websocket');

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get conversation history for a browser session
app.get('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const filePath = path.join(__dirname, 'transcripts.jsonl');

  if (!fs.existsSync(filePath)) {
    return res.json({ session_id: sessionId, entries: [] });
  }

  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    const entries = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.browser_session_id === sessionId) {
          entries.push(obj);
        }
      } catch {
        // ignore malformed line
      }
    }

    return res.json({ session_id: sessionId, entries });
  } catch (err) {
    console.error('[server] error reading transcripts.jsonl', err);
    return res.status(500).json({ error: 'Failed to read transcripts' });
  }
});

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Attach WebSocket server
initWebSocketServer(server);

server.listen(PORT, () => {
  // Minimal but useful log
  console.log(`[server] HTTP + WebSocket listening on http://localhost:${PORT}`);
});


