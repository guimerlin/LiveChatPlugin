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
    const displayName = username || 'A user';
    console.log(`${displayName} joined room: ${groupId}`);

    // Create system notification message
    const systemMsg = {
      id: crypto.randomUUID(),
      userId: 'system',
      username: 'System',
      groupId: groupId,
      content: `${displayName} has joined the room.`,
      timestamp: new Date().toISOString(),
      isSystem: true
    };

    if (!roomHistory.has(groupId)) {
      roomHistory.set(groupId, []);
    }
    const historyArray = roomHistory.get(groupId);
    historyArray.push(systemMsg);
    if (historyArray.length > HISTORY_LIMIT) {
      historyArray.shift(); // Keep only latest HISTORY_LIMIT messages
    }

    // Send chat history for this room to the newly connected user
    socket.emit('chatHistory', historyArray);

    // Broadcast system message to others in the room
    socket.to(groupId).emit('newMessage', systemMsg);
  });

  // Leave a SyncPlay group chat
  socket.on('leaveRoom', ({ groupId, username }) => {
    if (!groupId) return;
    socket.leave(groupId);
    const displayName = username || 'A user';
    console.log(`${displayName} left room: ${groupId}`);

    // Create system notification message
    const systemMsg = {
      id: crypto.randomUUID(),
      userId: 'system',
      username: 'System',
      groupId: groupId,
      content: `${displayName} has left the room.`,
      timestamp: new Date().toISOString(),
      isSystem: true
    };

    if (!roomHistory.has(groupId)) {
      roomHistory.set(groupId, []);
    }
    const historyArray = roomHistory.get(groupId);
    historyArray.push(systemMsg);
    if (historyArray.length > HISTORY_LIMIT) {
      historyArray.shift(); // Keep only latest HISTORY_LIMIT messages
    }

    // Broadcast system message to others in the room
    socket.to(groupId).emit('newMessage', systemMsg);
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
