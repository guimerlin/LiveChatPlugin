const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const HISTORY_LIMIT = 100;
// In-memory store for chat history per SyncPlay room (groupId)
// Map<groupId, Array<Message>>
const roomHistory = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a SyncPlay group chat
  socket.on('joinRoom', ({ groupId, username }) => {
    if (!groupId) return;
    
    socket.join(groupId);
    console.log(`${username || socket.id} joined room: ${groupId}`);

    // Send chat history for this room to the newly connected user
    const history = roomHistory.get(groupId) || [];
    socket.emit('chatHistory', history);
  });

  // Leave a SyncPlay group chat
  socket.on('leaveRoom', ({ groupId, username }) => {
    if (!groupId) return;
    socket.leave(groupId);
    console.log(`${username || socket.id} left room: ${groupId}`);
  });

  // Handle incoming chat messages
  socket.on('sendMessage', ({ groupId, userId, username, content }) => {
    if (!groupId || !content || content.trim().length === 0) return;

    const message = {
      id: crypto.randomUUID(),
      userId: userId,
      username: username || 'Unknown',
      groupId: groupId,
      content: content.substring(0, 500), // Limit length
      timestamp: new Date().toISOString()
    };

    // Save to history
    if (!roomHistory.has(groupId)) {
      roomHistory.set(groupId, []);
    }
    const history = roomHistory.get(groupId);
    history.push(message);
    if (history.length > HISTORY_LIMIT) {
      history.shift(); // Keep only latest HISTORY_LIMIT messages
    }

    // Broadcast to everyone in the room (including sender)
    io.to(groupId).emit('newMessage', message);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SyncPlay Chat Server running on port ${PORT}`);
});
