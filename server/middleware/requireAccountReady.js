const User = require('../models/User');

async function requireAccountReady(req, res, next) {
  try {
    const u = await User.findById(req.userId).lean();
    if (!u) {
      return res.status(401).json({ error: 'User not found' });
    }
    const ready =
      !!u.emailVerified &&
      !!u.phoneVerified &&
      !!u.cnicDocumentPath;
    if (!ready) {
      return res.status(403).json({
        error: 'Complete email, phone, and CNIC card verification before using rides.',
        code: 'ACCOUNT_INCOMPLETE',
      });
    }
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Verification check failed' });
  }
}

module.exports = { requireAccountReady };
