const { Server } = require('socket.io');
const { apiKey, corsOptions } = require('../config');
const dbService = require('../services/database');
const handleStartBattle = require('../helpers/startBattle');

const socketToUserIdMap = new Map();
const userToSocketMap = new Map();
let io;

async function socketHandler(server) {
  io = new Server(server, { cors: corsOptions }); // Initialize `io` here

  io.use((socket, next) => {
    // const authHeader = socket.handshake.query.authorization;
    // if (!authHeader || authHeader !== apiKey) {
    //   return next(new Error('Unauthorized'));
    // }
    next();
  });

  // Define socket events
  io.on('connection', (socket) => {
    socket.join(socket.handshake.query.roomId);
    const { userId } = socket.handshake.query;
    socketToUserIdMap.set(socket.id, userId);
    userToSocketMap.set(userId, socket.id);

    socket.on('message', async ({ message, room, action }) => {
      if (action === 'player joined lobby' || action === 'player left lobby') {
        socket.broadcast.to(room).emit('message', { message, action });
      } else if (action === 'player code') {
        const { data: battleData } = await dbService.getBattleState(room);
        const userNumber = socketToUserIdMap.get(socket.id) === battleData[0].user1_id ? 'user1' : 'user2';
        const updateData = { [`${userNumber}_code`]: message };
        await dbService.updateBattleState(room.slice(1), updateData);
        socket.broadcast.to(room).emit('message', { message, action });
      } else if (action === 'player ready') {
        socket.broadcast.to(room).emit('message', { message, action });
        const { data: inviteData } = await dbService.getBattleInvites(room.slice(1));
        if (inviteData && inviteData.length >= 1) {
          const updates = socketToUserIdMap.get(socket.id) === inviteData[0].sender_id
            ? { sender_ready: true }
            : { recipient_ready: true };
          const { data } = await dbService.updateBattleInvites(room.slice(1), updates);

          if (data && data.length >= 1 && data[0].sender_ready && data[0].recipient_ready) {
            const players = [data[0].sender_id, data[0].recipient_id];
            const battleInfo = await handleStartBattle(players, room.slice(1));
            io.to(room).emit('message', { message: battleInfo, action: 'start battle' });
          }
        }
      }
    });

    socket.on('disconnect', () => {
      // Clear maps on disconnect
      userToSocketMap.delete(userId);
      socketToUserIdMap.delete(socket.id);
    });
  });
}

function getSocketFromUserId(userId) {
  const socketId = userToSocketMap.get(userId);
  if (!socketId) {
    console.log('No socket found for user ID:', userId);
    return null;
  }
  return io.sockets.sockets.get(socketId);
}

function getUserIdFromSocket(socket) {
  const userId = socketToUserIdMap.get(socket.id);
  if (!userId) {
    console.log("No user ID found for socket ID:", socket.id);
    return null;
  }
  return userId;
}

module.exports = { socketHandler, getSocketFromUserId, getUserIdFromSocket };
