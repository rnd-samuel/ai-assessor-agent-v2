// backend/src/services/redis-publisher.ts
import { createClient } from 'redis';

let pubClient: any;

export const publishEvent = async (userId: string, type: string, payload: any) => {
  if (!process.env.UPSTASH_REDIS_URL) return;

  if (!pubClient) {
    pubClient = createClient({ url: process.env.UPSTASH_REDIS_URL });
    await pubClient.connect();
  }

  const message = JSON.stringify({ userId, type, payload });
  await pubClient.publish('worker-events', message);
};