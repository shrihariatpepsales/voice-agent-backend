require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');

const { initWebSocketServer } = require('./websocket');

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Attach WebSocket server
initWebSocketServer(server);

server.listen(PORT, () => {
  // Minimal but useful log
  console.log(`[server] HTTP + WebSocket listening on http://localhost:${PORT}`);
});


