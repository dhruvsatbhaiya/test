const User = require('../modals/User');


module.exports = async function subscriptionMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    const now = new Date();

    const subStart = user.subscriptionStart;
    const duration = user.planDurationDays;

    const isValid =
      subStart &&
      duration &&
      new Date(subStart.getTime() + duration * 24 * 60 * 60 * 1000) > now;

    if (!isValid) {
      return res.status(403).json({ message: 'Subscription expired or inactive' });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: 'Subscription check failed' });
  }
};
