require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { connectToDatabase } = require('./db');
const ConversationEntry = require('./models/ConversationEntry');

const { initWebSocketServer } = require('./websocket');

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes (login/signup with email or phone)
app.use('/api/auth', authRoutes);

// Get conversation history for a browser session
app.get('/api/conversations/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    await connectToDatabase();

    const docs = await ConversationEntry.find({
      browserSessionId: sessionId,
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    const entries = docs.map((doc) => ({
      timestamp: doc.createdAt.toISOString(),
      transcript: doc.userText,
      llm_response: doc.agentText,
      browser_session_id: doc.browserSessionId,
      mode: doc.mode,
      user_id: doc.user ? doc.user.toString() : null,
    }));

    return res.json({ session_id: sessionId, entries });
  } catch (err) {
    console.error('[server] error reading conversations from db', err);
    return res.status(500).json({ error: 'Failed to read conversations' });
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


