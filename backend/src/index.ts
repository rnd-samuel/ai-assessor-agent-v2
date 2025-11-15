// backend/src/index.ts)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { setupQueue, aiGenerationQueue, aiGenerationQueueEvents } from './services/queue';
import { setupSocket, getIO } from './services/socket';
import authRoutes from './routes/auth.routes';
import { authenticateToken, authorizeRole } from './middleware/auth.middleware';
import projectsRoutes from './routes/projects.routes';
import reportsRoutes from './routes/reports.routes';

import { Job } from 'bullmq';

interface AiJobData {
  reportId: string;
  userId: string;
}

const app = express();
const port = process.env.PORT || 3001;

// --- 1. Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Enable parsing of JSON request bodies

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

// --- 3. Initialize Services ---
setupSocket(io); // Make the 'io' instance available to other files
setupQueue(); // Connect to Redis and initialize queues

// Notification bridge
aiGenerationQueueEvents.on('completed', async (args: { jobId: string, returnvalue: any }) => {
  console.log(`[Queue Events] Job ${args.jobId} completed.`);
  try {
    // 1. Fetch the job from the queue using its ID
    const job = await aiGenerationQueue.getJob(args.jobId) as Job<AiJobData> | undefined;

    // 2. Now you can safely check 'if (job)'
    if (job) {
      const { userId, reportId } = job.data;
      if (userId && reportId) {
        getIO().to(userId).emit('generation-complete', {
          reportId: reportId,
          phase: 1,
          status: 'COMPLETED',
          message: 'Evidence list has finished generating.'
        });
      }
    }
  } catch (error) {
    console.error(`[Queue Events] Error fetching completed job ${args.jobId}:`, error);
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
      
      // 'err.message' is now 'args.failedReason'
      const errMessage = args.failedReason;

      if (userId && reportId) {
        getIO().to(userId).emit('generation-failed', {
          reportId: reportId,
          phase: 1,
          status: 'FAILED',
          message: `Evidence generation failed: ${errMessage}`
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

app.get('/api/protected-test', authenticateToken, (req: any, res) => {
  res.send({
    message: "Success! You are authenticated.",
    user: req.user
  });
});

// This route is protected. You must be an 'Admin'.
app.get('/api/admin-test', authenticateToken, authorizeRole('Admin'), (req: any, res) => {
  res.send({
    message: "Success! You are an Admin.",
    user: req.user
  });
});

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