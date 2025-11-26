// backend/src/services/socket.ts
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

let io: Server;

export const setupSocket = async (serverInstance: Server) => {
  io = serverInstance;

  // 1. Setup Redis Pub/Sub Clients
  if (!process.env.UPSTASH_REDIS_URL) {
    console.warn("⚠️ UPSTASH_REDIS_URL missing. Socket.io running in single-node mode (Not Scalable).");
  } else {
    const pubClient = createClient({ url: process.env.UPSTASH_REDIS_URL });
    const subClient = pubClient.duplicate();

    try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        
        // 2. Attach Adapter
        io.adapter(createAdapter(pubClient, subClient));
        console.log("✅ Socket.io Redis Adapter configured successfully.");
    } catch (error) {
        console.error("❌ Failed to connect Redis Adapter:", error);
    }
  }

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

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

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};