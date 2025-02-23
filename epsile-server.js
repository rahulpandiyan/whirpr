#!/usr/bin/env node
// epsile server
// created by djazz
'use strict';

// Config
var port = 8001;

// Load and initialize modules
var express = require('express');
var compression = require('compression');
var http = require('http');
var { Server } = require('socket.io');

var app = express();
var server = http.createServer(app);
var io = new Server(server, {
  cors: { origin: "*" }  // Allow requests from any origin
});

// Start server
server.listen(port, function () {
  console.log('epsile server listening at port %d', port);
});

// Middleware
app.use(compression());
app.use(express.static(__dirname + '/'));

// Global variables, keeps the state of the app
var sockets = {},
  users = {},
  strangerQueue = false,
  peopleActive = 0,
  peopleTotal = 0;

// Helper functions for logging
function fillZero(val) {
  return val > 9 ? "" + val : "0" + val;
}

function timestamp() {
  var now = new Date();
  return "[" + fillZero(now.getHours()) + ":" + fillZero(now.getMinutes()) + ":" + fillZero(now.getSeconds()) + "]";
}

// Listen for connections
io.on('connection', function (socket) {
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
  socket.on("new", function () {
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
  socket.on("disconn", function () {
    var connTo = users[socket.id].connectedTo;
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
  socket.on('chat', function (message) {
    if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo]) {
      sockets[users[socket.id].connectedTo].emit('chat', message);
    }
  });

  // Typing indicator
  socket.on('typing', function (isTyping) {
    if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo] && users[socket.id].isTyping !== isTyping) {
      users[socket.id].isTyping = isTyping;
      sockets[users[socket.id].connectedTo].emit('typing', isTyping);
    }
  });

  // Disconnect event
  socket.on("disconnect", function (err) {
    var connTo = users[socket.id]?.connectedTo ?? -1;
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

