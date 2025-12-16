// backend/src/index.ts)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { setupQueue, aiGenerationQueue, aiGenerationQueueEvents } from './services/queue';
import { setupSocket, getIO } from './services/socket';
import authRoutes from './routes/auth.routes';
import { authenticateToken, authorizeRole } from './middleware/auth.middleware';
import projectsRoutes from './routes/projects.routes';
import reportsRoutes from './routes/reports.routes';
import adminRoutes from './routes/admin.routes';
import './worker';

import { Job } from 'bullmq';

interface AiJobData {
  reportId: string;
  userId: string;
}

const app = express();
const port = process.env.PORT || 3001;

// --- 1. Middleware ---
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://ai-assessor-agent.vercel.app"
  ],
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 2. Create HTTP & WebSocket Servers ---
// We create an HTTP server from our Express app
const httpServer = http.createServer(app);

// We attach socket.io to that HTTP server
// This gives us our 'io' instance for real-time events (U31)
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Allow our React app
    methods: ["GET", "POST"]
  }
});

// --- Redis Subscriber for Worker Events ---
const setupWorkerBridge = async () => {
  if (!process.env.UPSTASH_REDIS_URL) {
    console.warn("⚠️ UPSTASH_REDIS_URL missing. Worker notifications will not reach frontend.");
    return;
  }

  const subClient = createClient({ url: process.env.UPSTASH_REDIS_URL });
  subClient.on('error', (err) => console.error('[Bridge] Redis Client Error', err));
  await subClient.connect();

  // Subscribe to a dedicated channel for worker notifications
  await subClient.subscribe('worker-events', (message) => {
    try {
      const event = JSON.parse(message);
      
      // Forward to specific user via Socket.io
      if (event.userId && event.type) {
        // io.to(userId) works because we joined the room in socket.ts
        getIO().to(event.userId).emit(event.type, event.payload);
        console.log(`[Bridge] Forwarded ${event.type} to user ${event.userId}`);
      }
    } catch (e) {
      console.error('[Bridge] Failed to parse worker message:', e);
    }
  });
  
  console.log('✅ Main Server subscribed to worker events');
};

// --- 3. Initialize Services ---
const startServer = async () => {
  try {
    await setupSocket(io); // Make the 'io' instance available to other files
    await setupWorkerBridge();
    setupQueue(); // Connect to Redis and initialize queues

// Notification bridge
    aiGenerationQueueEvents.on('completed', async (args: { jobId: string, returnvalue: any }) => {
      console.log(`[Queue Events] Job ${args.jobId} completed.`);
      try {
        // 1. Fetch the job from the queue using its ID
        const job = await aiGenerationQueue.getJob(args.jobId) as Job<AiJobData> | undefined;

        // 2. Now you can safely check 'if (job)'
        if (job && job.name.startsWith('generate-phase')) {
          const { userId, reportId } = job.data;
          if (userId && reportId) {
            getIO().to(userId).emit('generation-complete', {
              reportId: reportId,
              phase: 1, // Simplified, ideally derive from job name
              status: 'COMPLETED',
              message: 'Generation task completed.'
            });
          }
        }
      } catch (error) {
        console.error(`[Queue Events] Error handling completion for ${args.jobId}:`, error);
      }
    });

    aiGenerationQueueEvents.on('failed', async (args: { jobId: string, failedReason: string }, id: string) => {
      console.log(`[Queue Events] Job ${args.jobId} failed: ${args.failedReason}`);
      try {
        // 1. Fetch the job from the queue using its ID
        const job = await aiGenerationQueue.getJob(args.jobId) as Job<AiJobData> | undefined;

        // 2. This is the block you were asking about! Now 'job' is defined.
        if (job) {
          const { userId, reportId } = job.data;

          if (userId && reportId) {
            getIO().to(userId).emit('generation-failed', {
              reportId: reportId,
              phase: 1,
              status: 'FAILED',
              message: `Generation failed: ${args.failedReason}`
            });
          }
        }
      } catch (error) {
        console.error(`[Queue Events] Error fetching failed job ${args.jobId}:`, error);
      }
    });

    // --- 4. API Routes (We will build these out next) ---
    app.use('/api/auth', authRoutes);
    app.use('/api/projects', projectsRoutes);
    app.use('/api/reports', reportsRoutes);
    app.use('/api/admin', adminRoutes);

    app.get('/', (req, res) => {
      res.send('AI Assessor Agent API is running!');
    });

    // Example: A test route to add a job to the queue
    app.post('/api/test-job', async (req, res) => {
      console.log('Adding test job to queue...');
      await aiGenerationQueue.add('test-job', { data: "This is a test" });
      res.status(202).send({ message: "Test job added to queue." });
    });

    // --- 5. Start The Server ---
    httpServer.listen(port, () => {
      console.log(`🚀 Server with WebSockets listening on http://localhost:${port}`);
    });

  } catch (err) {
    console.error("Failed to start server:", err);
  }
};

startServer();