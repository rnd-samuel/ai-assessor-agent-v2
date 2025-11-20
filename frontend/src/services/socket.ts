// frontend/src/services/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectSocket = (userId: string) => {
  if (!socket) {
    socket = io('http://localhost:3001', {
      query: { userId },
    });
    console.log('Socket Service: Initializing connection...');
  }
  return socket;
};

export const getSocket = () => {
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('Socket Service: Disconnected.');
  }
};