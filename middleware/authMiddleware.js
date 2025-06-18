// const jwt = require('jsonwebtoken');

// module.exports = function  authMiddleware(req, res, next) {
//   const token = req.header('Authorization');

//   if (!token) return res.status(401).json({ message: 'No token, auth denied' });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     res.status(401).json({ message: 'Token is not valid' });
//   }
// };




const jwt = require('jsonwebtoken');
const User = require('../modals/User'); // ✅ Import the User model

module.exports = async function authMiddleware(req, res, next) {
  const token = req.header('Authorization');

  if (!token) return res.status(401).json({ message: 'No token, auth denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Fetch full user from DB
    const user = await User.findById(decoded.id || decoded._id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    // ✅ Attach full user object to request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ message: 'Token is not valid' });
  }
};
