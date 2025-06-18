// server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const createAuthRouter = require('./routes.js/Auth'); // <-- ✅
const path = require('path');

dotenv.config();

const app = express();
app.use(cors({
  origin: "https://fronttest1-nu.vercel.app",
   credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const User = require('./modals/User');

// app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error(err));

// -------------------- SOCKET.IO LOGIC --------------------

const dashboardClients = {};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

socket.on('register-dashboard', (userId) => {
  dashboardClients[userId.toString()] = socket.id; // Ensure it's a string
  console.log(`Dashboard registered: ${userId}`);
});


  socket.on('disconnect', () => {
    for (const [userId, socketId] of Object.entries(dashboardClients)) {
      if (socketId === socket.id) {
        delete dashboardClients[userId];
        break;
      }
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ✅ Inject `io` and `dashboardClients` into the routes
const authRouter = createAuthRouter(io, dashboardClients);
app.use('/api/auth', authRouter);


const frontendRoutes = ['/upload/:code', '/', '/dashboard', '/login', '/register'];

// Serve frontend build
frontendRoutes.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
});

// -------------------- START SERVER --------------------

const PORT = process.env.PORT
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
