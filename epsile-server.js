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

  // If there's already a user in the queue, connect the new user to them
  if (strangerQueue !== false) {
    users[socket.id].connectedTo = strangerQueue;
    users[strangerQueue].connectedTo = socket.id;
    users[socket.id].isTyping = false;
    users[strangerQueue].isTyping = false;
    
    socket.emit('conn');
    sockets[strangerQueue].emit('conn');
    
    // Reset the queue after the connection
    strangerQueue = false;
  } else {
    // If no one is in the queue, add the new user to the queue
    strangerQueue = socket.id;
  }

  peopleActive++;
  peopleTotal++;
  console.log(timestamp(), peopleTotal, "connect");
  io.emit('stats', { people: peopleActive });

  // New conversation request
  socket.on("new", () => {
    if (strangerQueue !== false) {
      // If there's a user in the queue, connect the new user to them
      users[socket.id].connectedTo = strangerQueue;
      users[strangerQueue].connectedTo = socket.id;
      users[socket.id].isTyping = false;
      users[strangerQueue].isTyping = false;
      
      socket.emit('conn');
      sockets[strangerQueue].emit('conn');
      
      // Reset the queue
      strangerQueue = false;
    } else {
      // Otherwise, add the user to the queue
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

  // Typing indicator with timeout handling
  let typingTimeout;

  socket.on('typing', (isTyping) => {
    const connTo = users[socket.id].connectedTo;

    // Only process the typing event if connected to someone else
    if (connTo !== -1 && sockets[connTo] && users[socket.id].isTyping !== isTyping) {
      users[socket.id].isTyping = isTyping;

      // Clear existing timeout if typing is still happening
      clearTimeout(typingTimeout);

      // If typing, emit to the other user, not the current one
      if (isTyping) {
        sockets[connTo].emit('typing', isTyping);
      } else {
        typingTimeout = setTimeout(() => {
          // Emit that typing has stopped to the other user
          sockets[connTo].emit('typing', false);
        }, 2000); // Stop typing indicator after 2 seconds
      }
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
