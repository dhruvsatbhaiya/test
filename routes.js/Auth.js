





// // plan_QeM7bStlPkReP2
// //  4706137805099594
// //plan_QeJmid0DN3lShM





const express = require('express');
const User = require('../modals/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const subscriptionMiddleware = require('../middleware/subscriptionMiddleware');
const bodyParser = require('body-parser');
const Razorpay = require('razorpay');
const SupportQuery =require('../modals/SupportQuery')

const upload = multer({ storage: multer.memoryStorage() });

const activeUsers = new Set(); // Track active users

function createAuthRouter(io, dashboardClients) {
  const router = express.Router();

  // --- SOCKET.IO: Track active users ---
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('register-dashboard', (userId) => {
      socket.userId = userId;
      activeUsers.add(userId);
      io.emit('active-users', Array.from(activeUsers));
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        activeUsers.delete(socket.userId);
        io.emit('active-users', Array.from(activeUsers));
      }
      console.log('Socket disconnected:', socket.id);
    });
  });

  router.get('/abcd',(req,res)=>{
    res.send('landing page')
  })

  // --- Admin API to get list of active users ---
  router.get('/admin/active-users', authMiddleware, adminMiddleware, (req, res) => {
    res.json(Array.from(activeUsers));
  });




  // GET /api/auth/support/:userId
router.get('/support/:userId', authMiddleware,adminMiddleware, async (req, res) => {
  try {
    const queries = await SupportQuery.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(queries);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching support queries' });
  }
});



  // ---------------------- Support Query API ------------------------
router.post('/support/submit', authMiddleware, async (req, res) => {
  const { message } = req.body;

  try {
    const newQuery = await SupportQuery.create({
      userId: req.user._id,
      name: req.user.username,
      email: req.user.email,
      message,
    });

    // Emit the query to all connected admins via socket
// Send support query only to registered dashboard/admin sockets
for (const socketId of Object.values(dashboardClients)) {
  io.to(socketId).emit('newSupportQuery', newQuery);
}

    res.status(200).json({ success: true, message: 'Query submitted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error submitting query' });
  }
});


  // ---------------------- All Your Existing Routes -----------------------

  router.post('/admin/ban-toggle/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      user.isBanned = !user.isBanned;
      await user.save();

      res.json({
        message: user.isBanned ? 'User has been banned' : 'User has been unbanned',
        isBanned: user.isBanned,
      });
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ message: 'Email already in use' });

      const hashed = await bcrypt.hash(password, 10);
      const newUser = new User({
        username,
        email,
        password: hashed,
        qrCode: generateUniqueCode(),
      });

      await newUser.save();
      const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

      res.json({ token, user: { id: newUser._id, username: newUser.username, email: newUser.email } });
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (user.isBanned) return res.status(403).json({ message: 'You are banned. Contact support.' });
      if (!user) return res.status(400).json({ message: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

      res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.get('/by-code/:code', async (req, res) => {
    try {
      const user = await User.findOne({ qrCode: req.params.code });
      if (!user) return res.status(404).json({ message: 'Not found' });
      res.json({ username: user.username });
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/upload/:code', upload.array('files'), async (req, res) => {
    const { code } = req.params;
    const { customerName } = req.body;
    const user = await User.findOne({ qrCode: code.trim() });

    if (!user) return res.status(404).json({ message: 'Invalid QR' });

    const socketId = dashboardClients[user._id.toString()];
    if (Array.isArray(req.files) && req.files.length > 0) {
      req.files.forEach(file => {
        const fileBase64 = file.buffer.toString('base64');
        const mimeType = file.mimetype;

        if (socketId) {
          io.to(socketId).emit('new-file', {
            name: file.originalname,
            size: file.size,
            data: fileBase64,
            type: mimeType,
            customerName: customerName || 'Anonymous',
          });
        }
      });

      console.log(`Sent ${req.files.length} files to dashboard of ${user.username}`);
      return res.status(200).json({ message: 'Files uploaded' });
    } else {
      return res.status(400).json({ message: 'No files provided' });
    }
  });

  router.get('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const users = await User.find().select('-password');
      const now = new Date();

      const enrichedUsers = users.map(user => {
        const subStart = user.subscriptionStart || new Date();
        const planDays = user.planDurationDays || 0;
        const expiry = new Date(subStart.getTime() + planDays * 24 * 60 * 60 * 1000);
        const daysLeft = Math.max(Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)), 0);

        return {
          id: user._id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin,
          isBanned: user.isBanned,
          subscriptionStart: user.subscriptionStart,
          planDurationDays: user.planDurationDays,
          subscriptionExpiresOn: expiry,
          daysRemaining: daysLeft,
          razorpaySubId: user.razorpaySubId,
        };
      });

      res.json(enrichedUsers);
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  // router.post('/create-subscription', authMiddleware, async (req, res) => {
  //   try {
  //     const customer = await razorpay.customers.create({
  //       email: req.user.email,
  //       name: req.user.username,
  //     });

  //     const options = {
  //       plan_id: 'plan_QeJmid0DN3lShM',
  //       customer_notify: 1,
  //       total_count: 1,
  //       customer_id: customer.id,
  //     };

  //     const subscription = await razorpay.subscriptions.create(options);

  //     await User.findByIdAndUpdate(req.user.id, {
  //       razorpaySubId: subscription.id,
  //     });

  //     res.json({ subscriptionId: subscription.id, razorpayKey: process.env.RAZORPAY_KEY_ID });
  //   } catch (err) {
  //     console.error(err);
  //     res.status(500).json({ message: 'Failed to create subscription' });
  //   }
  // });
router.post('/create-subscription', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    let customerId = user.razorpayCustomerId;
    if (!customerId) {
      const customer = await razorpay.customers.create({
        email: user.email,
        name: user.username,
      });
      customerId = customer.id;
      user.razorpayCustomerId = customerId;
      await user.save();
    }

    // Check if expired
    let isExpired = true;
    if (user.subscriptionStart && user.planDurationDays) {
      const expiryDate = new Date(user.subscriptionStart);
      expiryDate.setDate(expiryDate.getDate() + user.planDurationDays);
      isExpired = new Date() > expiryDate;
    }

    // Cancel old if expired
    if (user.razorpaySubId && isExpired) {
      try {
        await razorpay.subscriptions.cancel(user.razorpaySubId);
        console.log('✅ Old subscription canceled');
      } catch (err) {
        console.warn('⚠️ Could not cancel old sub:', err.message);
      }
    }

    // Create new subscription
    const options = {
      plan_id: 'plan_QeJmid0DN3lShM',
      customer_notify: 1,
      total_count: 1,
      customer_id: customerId,
    };

    const subscription = await razorpay.subscriptions.create(options);

    user.razorpaySubId = subscription.id;
    await user.save();

    res.json({
      subscriptionId: subscription.id,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('❌ Create subscription error:', err.message);
    res.status(500).json({ message: 'Failed to create subscription' });
  }
});



  router.use('/razorpay-webhook', bodyParser.raw({ type: 'application/json' }));

  router.post('/razorpay-webhook', async (req, res) => {
    try {
      let payload;
      if (Buffer.isBuffer(req.body)) {
        payload = JSON.parse(req.body.toString('utf8'));
      } else if (typeof req.body === 'object') {
        payload = req.body;
      } else {
        throw new Error('Unsupported body format');
      }

      console.log('📥 Webhook Event:', payload.event);
      if (payload.event === 'subscription.charged') {
        const subscription = payload.payload.subscription.entity;
        const subscription_id = subscription.id;
        const plan = await razorpay.plans.fetch(subscription.plan_id);
        const durationDays = calculatePlanDurationDays(plan.period, plan.interval);

        const user = await User.findOne({ razorpaySubId: subscription_id });
        if (!user) return res.status(404).send('User not found');

        user.subscriptionStart = new Date();
        user.planDurationDays = durationDays;
        await user.save();

        io.emit('subscription-updated');
        console.log(`📢 Subscription update sent to dashboard: ${user.email}`);
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('❌ Webhook error:', err);
      res.status(400).send('Invalid payload');
    }
  });

  router.get('/me', authMiddleware, async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('-password');
      if (!user) return res.status(404).json({ message: 'User not found' });

      const now = new Date();
      const subStart = user.subscriptionStart || new Date();
      const planDays = user.planDurationDays || 0;
      const expiry = new Date(subStart.getTime() + planDays * 24 * 60 * 60 * 1000);
      const daysLeft = Math.max(Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)), 0);

      res.json({
        id: user._id,
        username: user.username,
        email: user.email,
        qrCode: user.qrCode,
        isAdmin: user.isAdmin,
        isBanned: user.isBanned,
        subscriptionStart: user.subscriptionStart,
        planDurationDays: user.planDurationDays,
        subscriptionExpiresOn: expiry,
        daysRemaining: daysLeft
      });
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
}

function calculatePlanDurationDays(period, interval) {
  switch (period) {
    case 'daily': return interval;
    case 'weekly': return interval * 7;
    case 'monthly': return interval * 30;
    case 'yearly': return interval * 365;
    default: return 0;
  }
}

function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = createAuthRouter;
