// frontend/src/services/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// 1. Get the API URL from the environment variable
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// 2. Strip the '/api' suffix to get the root domain (where Socket.io lives)
// Example: "https://my-app.run.app/api" -> "https://my-app.run.app"
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const connectSocket = (userId: string) => {
  if (!socket) {
    console.log(`[Socket] Initializing connection to: ${SOCKET_URL}`);
    
    socket = io(SOCKET_URL, {
      query: { userId },
      // Recommended for production to avoid CORS/polling issues
      transports: ['websocket', 'polling'], 
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection Error:', err.message);
    });
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
    console.log('[Socket] Disconnected.');
  }
};