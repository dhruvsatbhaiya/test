const mongoose = require('mongoose');

const supportQuerySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Userqr' },
  name: String,
  email: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SupportQuery', supportQuerySchema);
