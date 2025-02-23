#!/usr/bin/env node
// epsile server
// created by djazz
'use strict';

// Config
const PORT = process.env.PORT || 8001;  // Use Railway's assigned port if available

// Load and initialize modules
const express = require('express');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }  // Allow requests from any origin
});

// Start server
server.listen(PORT, () => {
  console.log(`epsile server listening at port ${PORT}`);
});

// Middleware
app.use(compression());
app.use(express.static(__dirname + '/'));

// Global variables, keeps the state of the app
let sockets = {},
  users = {},
  strangerQueue = false,
  peopleActive = 0,
  peopleTotal = 0;

// Helper functions for logging
function fillZero(val) {
  return val > 9 ? "" + val : "0" + val;
}

function timestamp() {
  const now = new Date();
  return `[${fillZero(now.getHours())}:${fillZero(now.getMinutes())}:${fillZero(now.getSeconds())}]`;
}

// Listen for connections
io.on('connection', (socket) => {
  sockets[socket.id] = socket;
  users[socket.id] = { connectedTo: -1, isTyping: false };

  // Connect the user to another if strangerQueue isn't empty
  if (strangerQueue !== false) {
    users[socket.id].connectedTo = strangerQueue;
    users[socket.id].isTyping = false;
    users[strangerQueue].connectedTo = socket.id;
    users[strangerQueue].isTyping = false;
    socket.emit('conn');
    sockets[strangerQueue].emit('conn');
    strangerQueue = false;
  } else {
    strangerQueue = socket.id;
  }

  peopleActive++;
  peopleTotal++;
  console.log(timestamp(), peopleTotal, "connect");
  io.emit('stats', { people: peopleActive });

  // New conversation
  socket.on("new", () => {
    if (strangerQueue !== false) {
      users[socket.id].connectedTo = strangerQueue;
      users[strangerQueue].connectedTo = socket.id;
      users[socket.id].isTyping = false;
      users[strangerQueue].isTyping = false;
      socket.emit('conn');
      sockets[strangerQueue].emit('conn');
      strangerQueue = false;
    } else {
      strangerQueue = socket.id;
    }
    peopleActive++;
    io.emit('stats', { people: peopleActive });
  });

  // Conversation ended
  socket.on("disconn", () => {
    const connTo = users[socket.id].connectedTo;
    if (strangerQueue === socket.id || strangerQueue === connTo) {
      strangerQueue = false;
    }
    users[socket.id].connectedTo = -1;
    users[socket.id].isTyping = false;
    if (sockets[connTo]) {
      users[connTo].connectedTo = -1;
      users[connTo].isTyping = false;
      sockets[connTo].emit("disconn", { who: 2 });
    }
    socket.emit("disconn", { who: 1 });
    peopleActive -= 2;
    io.emit('stats', { people: peopleActive });
  });

  // Chat messages
  socket.on('chat', (message) => {
    if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo]) {
      sockets[users[socket.id].connectedTo].emit('chat', message);
    }
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo] && users[socket.id].isTyping !== isTyping) {
      users[socket.id].isTyping = isTyping;
      sockets[users[socket.id].connectedTo].emit('typing', isTyping);
    }
  });

  // Disconnect event
  socket.on("disconnect", (err) => {
    const connTo = users[socket.id]?.connectedTo ?? -1;
    if (connTo !== -1 && sockets[connTo]) {
      sockets[connTo].emit("disconn", { who: 2, reason: err?.toString() });
      users[connTo].connectedTo = -1;
      users[connTo].isTyping = false;
      peopleActive -= 2;
    }

    delete sockets[socket.id];
    delete users[socket.id];

    if (strangerQueue === socket.id || strangerQueue === connTo) {
      strangerQueue = false;
      peopleActive--;
    }
    peopleTotal--;
    console.log(timestamp(), peopleTotal, "disconnect");
    io.emit('stats', { people: peopleActive });
  });
});
