const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  qrCode: { type: String, default: '' },
  isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
   razorpayCustomerId: String,

subscriptionStart: { type: Date, default: null },
planDurationDays: { type: Number, default: null },
 razorpaySubId: { type: String, default: null },
});

module.exports = mongoose.model('Userqr', UserSchema);
