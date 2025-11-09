// backend/src/services/socket.ts
import { Server, Socket } from 'socket.io';

let io: Server;

export const setupSocket = (serverInstance: Server) => {
  io = serverInstance;

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join a room based on user ID for private messages (U31)
    const userId = socket.handshake.query.userId;
    if (userId) {
      socket.join(String(userId));
      console.log(`User ${userId} joined their private room.`);
    }

    socket.on('disconnect', () => {
      console.log(`🔥 Client disconnected: ${socket.id}`);
    });
  });
};

// This export allows us to emit events from anywhere in the backend
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};