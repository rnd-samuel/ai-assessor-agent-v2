// backend/src/index.ts)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { setupQueue, aiGenerationQueue } from './services/queue'; // FRD 2.1
import { setupSocket } from './services/socket';
import authRoutes from './routes/auth.routes';
import { authenticateToken, authorizeRole } from './middleware/auth.middleware';
import projectsRoutes from './routes/projects.routes';
import reportsRoutes from './routes/reports.routes';

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