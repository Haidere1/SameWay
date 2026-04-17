require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const User = require('./models/User');
const Ride = require('./models/Ride');
const JoinRequest = require('./models/JoinRequest');
const ChatThread = require('./models/ChatThread');
const Notification = require('./models/Notification');
const Review = require('./models/Review');
const { authMiddleware, optionalAuth } = require('./middleware/auth');
const { requireAccountReady } = require('./middleware/requireAccountReady');
const { haversineKm } = require('./utils/geo');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const uploadsRoot = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsRoot, 'avatars');
const cnicDir = path.join(uploadsRoot, 'cnic');

const imageFilter = (_req, file, cb) => {
  const mt = String(file.mimetype || '').toLowerCase();
  const name = String(file.originalname || '');
  // RN / Expo often sends image/* including heic; Android may use octet-stream.
  if (mt.startsWith('image/')) {
    return cb(null, true);
  }
  if (mt === 'application/octet-stream' && /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(name)) {
    return cb(null, true);
  }
  cb(new Error('Upload must be an image file (e.g. JPG, PNG, or HEIC from the camera roll).'));
};

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});

const uploadSignup = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'cnicCard') cb(null, cnicDir);
      else cb(null, avatarsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.jpg';
      const prefix = file.fieldname === 'cnicCard' ? 'cnic' : 'av';
      cb(null, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: imageFilter,
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cnicCard', maxCount: 1 },
]);

function ensureUploadDirs() {
  fs.mkdirSync(avatarsDir, { recursive: true });
  fs.mkdirSync(cnicDir, { recursive: true });
}

function randomSixDigit() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function accountReady(u) {
  return !!(u.emailVerified && u.phoneVerified && u.cnicDocumentPath);
}

function logListenUrls() {
  console.log(`API on this PC: http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (isV4 && !net.internal) {
        console.log(`API on LAN (Expo Go / same network): http://${net.address}:${PORT}`);
      }
    }
  }
}

function baseUrl(req) {
  const host = req.get('host') || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

function normalizeCnic(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 13 ? digits : null;
}

function driverPublic(d, base, contact) {
  if (!d || !d._id) return null;
  const avatarUrl = d.avatarPath ? `${base}${d.avatarPath}` : null;
  const common = {
    id: d._id.toString(),
    name: d.name,
    avatarUrl,
  };
  if (!contact) return common;
  return {
    ...common,
    email: d.email,
    phone: d.phone,
    cnic: d.cnic,
  };
}

function serializeRide(r, base, { distanceKm, driverContact } = {}) {
  const out = {
    id: r._id.toString(),
    from: r.from,
    to: r.to,
    when: r.when instanceof Date ? r.when.toISOString() : new Date(r.when).toISOString(),
    seatCount: r.seatCount,
    passengerIds: (r.passengers || []).map((p) => p.toString()),
    fromLat: r.fromLat != null ? r.fromLat : null,
    fromLng: r.fromLng != null ? r.fromLng : null,
    toLat: r.toLat != null ? r.toLat : null,
    toLng: r.toLng != null ? r.toLng : null,
    cancelled: !!r.cancelled,
    driver: driverPublic(r.driver, base, driverContact),
  };
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    out.distanceKm = Math.round(distanceKm * 10) / 10;
  }
  return out;
}

function userResponse(u, base) {
  const ready = accountReady(u);
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    cnic: u.cnic,
    phone: u.phone,
    avatarUrl: u.avatarPath ? `${base}${u.avatarPath}` : null,
    accountReady: ready,
    emailVerified: !!u.emailVerified,
    phoneVerified: !!u.phoneVerified,
    cnicDocumentUploaded: !!u.cnicDocumentPath,
    ratingAvg: u.ratingAvg ?? null,
    ratingCount: u.ratingCount ?? 0,
  };
}

function serializeJoinRequest(jr, base) {
  const out = {
    id: jr._id.toString(),
    rideId: jr.ride?._id ? jr.ride._id.toString() : String(jr.ride),
    status: jr.status,
    currentFare: jr.currentFare,
    proposedBy: jr.proposedBy,
    createdAt: jr.createdAt,
    updatedAt: jr.updatedAt,
  };
  if (jr.rider && jr.rider._id) {
    out.rider = {
      id: jr.rider._id.toString(),
      name: jr.rider.name,
      avatarUrl: jr.rider.avatarPath ? `${base}${jr.rider.avatarPath}` : null,
    };
  }
  if (jr.ride && typeof jr.ride === 'object' && jr.ride.from) {
    out.ride = {
      id: jr.ride._id.toString(),
      from: jr.ride.from,
      to: jr.ride.to,
      when: jr.ride.when instanceof Date ? jr.ride.when.toISOString() : jr.ride.when,
    };
  }
  return out;
}

function serializeChatThread(t, base) {
  const rideId = t.ride?._id ? t.ride._id.toString() : String(t.ride);
  const riderId = t.rider?._id ? t.rider._id.toString() : String(t.rider);
  const driverId = t.driver?._id ? t.driver._id.toString() : String(t.driver);
  let rideRoute = null;
  if (t.ride && typeof t.ride === 'object' && t.ride.from) {
    rideRoute = {
      id: rideId,
      from: t.ride.from,
      to: t.ride.to,
      when: t.ride.when instanceof Date ? t.ride.when.toISOString() : t.ride.when,
    };
  }
  return {
    id: t._id.toString(),
    rideId,
    riderId,
    driverId,
    ride: rideRoute,
    messages: (t.messages || []).map((m) => ({
      id: m._id.toString(),
      fromId: m.from.toString(),
      body: m.body,
      at: m.at instanceof Date ? m.at.toISOString() : m.at,
    })),
  };
}

app.use(cors({ origin: true, credentials: true }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsRoot));

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function unlinkUploadSafe(f) {
  if (!f?.path) return;
  try {
    fs.unlinkSync(f.path);
  } catch {
    /* ignore */
  }
}

app.post(
  '/api/auth/signup',
  (req, res, next) => {
    uploadSignup(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      next();
    });
  },
  async (req, res) => {
    const files = req.files || {};
    const photo = files.photo?.[0];
    const cnicCard = files.cnicCard?.[0];
    try {
      const { email, password, name, cnic, phone } = req.body;
      if (!email || !password || !name || !cnic || !phone) {
        unlinkUploadSafe(photo);
        unlinkUploadSafe(cnicCard);
        return res.status(400).json({ error: 'email, password, name, CNIC, phone, profile photo, and CNIC card image are required' });
      }
      if (!photo || !cnicCard) {
        unlinkUploadSafe(photo);
        unlinkUploadSafe(cnicCard);
        return res.status(400).json({ error: 'Profile photo and a clear photo of your CNIC card are required' });
      }
      const cnicNorm = normalizeCnic(cnic);
      if (!cnicNorm) {
        unlinkUploadSafe(photo);
        unlinkUploadSafe(cnicCard);
        return res.status(400).json({ error: 'CNIC must be 13 digits' });
      }
    const phoneTrim = String(phone).trim();
    const phoneDigits = phoneTrim.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      unlinkUploadSafe(photo);
      unlinkUploadSafe(cnicCard);
      return res.status(400).json({ error: 'Enter a valid phone number (10–15 digits)' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      unlinkUploadSafe(photo);
      unlinkUploadSafe(cnicCard);
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (String(password).length < 8) {
      unlinkUploadSafe(photo);
      unlinkUploadSafe(cnicCard);
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const existing = await User.findOne({
      $or: [{ email: emailNorm }, { cnic: cnicNorm }],
    });
      if (existing) {
        unlinkUploadSafe(photo);
        unlinkUploadSafe(cnicCard);
        return res.status(409).json({ error: 'Email or CNIC already registered' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const avatarPath = `/uploads/avatars/${path.basename(photo.path)}`;
      const cnicDocumentPath = `/uploads/cnic/${path.basename(cnicCard.path)}`;
      const emailCode = randomSixDigit();
      const phoneCode = randomSixDigit();
      const exp = new Date(Date.now() + 20 * 60 * 1000);
      const newUser = await User.create({
        email: emailNorm,
        passwordHash,
        name: String(name).trim(),
        cnic: cnicNorm,
        phone: phoneTrim,
        avatarPath,
        cnicDocumentPath,
        emailVerified: false,
        phoneVerified: false,
        emailVerifyCode: emailCode,
        emailVerifyExpires: exp,
        phoneVerifyCode: phoneCode,
        phoneVerifyExpires: exp,
      });
      const token = signToken(newUser._id.toString());
      const base = baseUrl(req);
      const uObj = newUser.toObject();
      const payload = {
        token,
        user: userResponse(uObj, base),
      };
      if (process.env.NODE_ENV !== 'production') {
        payload.devCodes = { email: emailCode, phone: phoneCode };
      }
      console.log(
        `[signup] ${newUser.email} — email code: ${emailCode}, phone code: ${phoneCode} (also emailed/SMS in production)`
      );
      res.status(201).json(payload);
    } catch (e) {
      unlinkUploadSafe(photo);
      unlinkUploadSafe(cnicCard);
      console.error(e);
      let message = 'Signup failed';
      if (e && typeof e === 'object') {
        if (e.code === 11000) {
          message = 'Email or CNIC already registered';
        } else if (typeof e.message === 'string' && e.message.includes('validation')) {
          message = e.message;
        }
      }
      res.status(500).json({ error: message });
    }
  }
);

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(user._id.toString());
    const base = baseUrl(req);
    res.json({
      token,
      user: userResponse(user.toObject ? user.toObject() : user, base),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const base = baseUrl(req);
    res.json(userResponse(user, base));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.post('/api/auth/verify-email', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || String(code).length !== 6) {
      return res.status(400).json({ error: 'Enter the 6-digit email code' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) {
      const base = baseUrl(req);
      return res.json({ ok: true, user: userResponse(user.toObject(), base) });
    }
    if (!user.emailVerifyCode || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (String(user.emailVerifyCode) !== String(code).trim()) {
      return res.status(400).json({ error: 'Invalid email code' });
    }
    user.emailVerified = true;
    user.emailVerifyCode = null;
    user.emailVerifyExpires = null;
    await user.save();
    const base = baseUrl(req);
    res.json({ ok: true, user: userResponse(user.toObject(), base) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/verify-phone', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || String(code).length !== 6) {
      return res.status(400).json({ error: 'Enter the 6-digit phone code' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.phoneVerified) {
      const base = baseUrl(req);
      return res.json({ ok: true, user: userResponse(user.toObject(), base) });
    }
    if (!user.phoneVerifyCode || !user.phoneVerifyExpires || user.phoneVerifyExpires < new Date()) {
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (String(user.phoneVerifyCode) !== String(code).trim()) {
      return res.status(400).json({ error: 'Invalid phone code' });
    }
    user.phoneVerified = true;
    user.phoneVerifyCode = null;
    user.phoneVerifyExpires = null;
    await user.save();
    const base = baseUrl(req);
    res.json({ ok: true, user: userResponse(user.toObject(), base) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/resend-email-code', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }
    const emailCode = randomSixDigit();
    const exp = new Date(Date.now() + 20 * 60 * 1000);
    user.emailVerifyCode = emailCode;
    user.emailVerifyExpires = exp;
    await user.save();
    console.log(`[resend-email] ${user.email} code: ${emailCode}`);
    const out = { ok: true };
    if (process.env.NODE_ENV !== 'production') out.devCode = emailCode;
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not resend code' });
  }
});

app.post('/api/auth/resend-phone-code', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.phoneVerified) {
      return res.status(400).json({ error: 'Phone already verified' });
    }
    const phoneCode = randomSixDigit();
    const exp = new Date(Date.now() + 20 * 60 * 1000);
    user.phoneVerifyCode = phoneCode;
    user.phoneVerifyExpires = exp;
    await user.save();
    console.log(`[resend-phone] ${user.phone} code: ${phoneCode}`);
    const out = { ok: true };
    if (process.env.NODE_ENV !== 'production') out.devCode = phoneCode;
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not resend code' });
  }
});

app.get('/api/rides', async (req, res) => {
  try {
    const now = new Date();
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const rides = await Ride.find({ when: { $gte: now }, cancelled: { $ne: true } })
      .sort({ when: 1 })
      .populate('driver', 'name email phone avatarPath cnic')
      .lean();

    const base = baseUrl(req);
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);

    let list = rides.map((r) => {
      let distanceKm;
      if (hasLoc && r.fromLat != null && r.fromLng != null) {
        distanceKm = haversineKm(lat, lng, r.fromLat, r.fromLng);
      }
      return serializeRide(r, base, { distanceKm, driverContact: false });
    });

    if (hasLoc) {
      list.sort((a, b) => {
        const da = a.distanceKm != null ? a.distanceKm : 1e9;
        const db = b.distanceKm != null ? b.distanceKm : 1e9;
        if (da !== db) return da - db;
        return new Date(a.when).getTime() - new Date(b.when).getTime();
      });
    }

    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list rides' });
  }
});

app.get('/api/rides/:id', optionalAuth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('driver').lean();
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    const base = baseUrl(req);
    const driverContact = !!req.userId;
    const out = serializeRide(ride, base, { driverContact });
    if (req.userId) {
      const jr = await JoinRequest.findOne({
        ride: ride._id,
        rider: req.userId,
        status: { $in: ['pending', 'negotiating'] },
      }).lean();
      if (jr) {
        out.myJoinRequest = serializeJoinRequest({ ...jr, ride, rider: null }, base);
      }
      const isPassenger = (ride.passengers || []).some((p) => p.toString() === req.userId);
      if (isPassenger) {
        const thread = await ChatThread.findOne({ ride: ride._id, rider: req.userId }).select('_id').lean();
        if (thread) out.chatThreadId = thread._id.toString();
      }
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load ride' });
  }
});

app.post('/api/rides', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const { from, to, when, seatCount, fromLat, fromLng, toLat, toLng } = req.body;
    if (from == null || to == null || when == null || seatCount == null) {
      return res.status(400).json({ error: 'from, to, when, and seatCount are required' });
    }
    const fl = Number(fromLat);
    const flng = Number(fromLng);
    const tl = Number(toLat);
    const tlng = Number(toLng);
    if (![fl, flng, tl, tlng].every((n) => Number.isFinite(n))) {
      return res.status(400).json({ error: 'Pickup and drop-off map locations are required' });
    }
    const seats = Number(seatCount);
    if (!Number.isFinite(seats) || seats < 1) {
      return res.status(400).json({ error: 'seatCount must be at least 1' });
    }
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid when date' });
    }
    const ride = await Ride.create({
      driver: req.userId,
      from: String(from).trim(),
      to: String(to).trim(),
      when: date,
      seatCount: seats,
      passengers: [],
      fromLat: fl,
      fromLng: flng,
      toLat: tl,
      toLng: tlng,
    });
    await ride.populate('driver', 'name email phone avatarPath cnic');
    const d = ride.driver;
    const base = baseUrl(req);
    res.status(201).json(
      serializeRide(
        { ...ride.toObject(), driver: d },
        base,
        { driverContact: true }
      )
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create ride' });
  }
});

async function createJoinNotification(driverId, title, message, rideId, joinRequestId) {
  await Notification.create({
    user: driverId,
    kind: 'join_request',
    title,
    message,
    ride: rideId,
    joinRequest: joinRequestId,
  });
}

async function createRiderNotification(riderId, title, message, rideId, joinRequestId) {
  await Notification.create({
    user: riderId,
    kind: 'join_update',
    title,
    message,
    ride: rideId,
    joinRequest: joinRequestId,
  });
}

app.post('/api/rides/:id/join-requests', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    if (ride.driver.toString() === req.userId) {
      return res.status(400).json({ error: 'You cannot request your own ride' });
    }
    const already = ride.passengers.some((p) => p.toString() === req.userId);
    if (already) {
      return res.status(400).json({ error: 'You are already on this ride' });
    }
    if (ride.passengers.length >= ride.seatCount) {
      return res.status(400).json({ error: 'Ride is full' });
    }
    const offeredFare = Number(req.body?.offeredFare);
    if (!Number.isFinite(offeredFare) || offeredFare <= 0) {
      return res.status(400).json({ error: 'offeredFare must be a positive number' });
    }
    const active = await JoinRequest.findOne({
      ride: ride._id,
      rider: req.userId,
      status: { $in: ['pending', 'negotiating'] },
    });
    if (active) {
      return res.status(400).json({ error: 'You already have an open join request for this ride' });
    }
    const jr = await JoinRequest.create({
      ride: ride._id,
      rider: req.userId,
      status: 'pending',
      currentFare: Math.round(offeredFare),
      proposedBy: 'rider',
    });
    await jr.populate('rider', 'name avatarPath');
    await jr.populate('ride', 'from to when');
    const base = baseUrl(req);
    await createJoinNotification(
      ride.driver,
      'New join request',
      `${jr.rider.name} offered PKR ${jr.currentFare} for your ride.`,
      ride._id,
      jr._id
    );
    res.status(201).json(serializeJoinRequest(jr.toObject(), base));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not create join request' });
  }
});

app.get('/api/me/join-requests', authMiddleware, async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.userId }).select('_id').lean();
    const rideIds = rides.map((r) => r._id);
    const list = await JoinRequest.find({
      ride: { $in: rideIds },
      status: { $in: ['pending', 'negotiating'] },
    })
      .populate('ride', 'from to when seatCount passengers driver')
      .populate('rider', 'name avatarPath')
      .sort({ updatedAt: -1 })
      .lean();
    const base = baseUrl(req);
    res.json(list.map((jr) => serializeJoinRequest(jr, base)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list join requests' });
  }
});

app.get('/api/me/notifications', authMiddleware, async (req, res) => {
  try {
    const rows = await Notification.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(80)
      .lean();
    res.json(
      rows.map((n) => ({
        id: n._id.toString(),
        kind: n.kind,
        title: n.title,
        message: n.message,
        read: n.read,
        rideId: n.ride ? n.ride.toString() : null,
        joinRequestId: n.joinRequest ? n.joinRequest.toString() : null,
        createdAt: n.createdAt,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

app.patch('/api/me/notifications/:nid/read', authMiddleware, async (req, res) => {
  try {
    const n = await Notification.findOne({ _id: req.params.nid, user: req.userId });
    if (!n) return res.status(404).json({ error: 'Not found' });
    n.read = true;
    await n.save();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.post('/api/join-requests/:jrId/driver-action', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const jr = await JoinRequest.findById(req.params.jrId).populate('ride').populate('rider', 'name avatarPath');
    if (!jr || !jr.ride) return res.status(404).json({ error: 'Join request not found' });
    if (jr.ride.driver.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only the driver can respond' });
    }
    const { action, counterFare } = req.body || {};
    const base = baseUrl(req);
    if (jr.status === 'accepted' || jr.status === 'rejected' || jr.status === 'withdrawn') {
      return res.status(400).json({ error: 'This request is closed' });
    }

    if (action === 'reject') {
      jr.status = 'rejected';
      await jr.save();
      return res.json(serializeJoinRequest(jr.toObject(), base));
    }

    if (action === 'accept') {
      if (jr.proposedBy !== 'rider') {
        return res.status(400).json({ error: 'Wait for the rider to accept or counter your fare first' });
      }
      const ride = await Ride.findById(jr.ride._id);
      if (ride.passengers.length >= ride.seatCount) {
        return res.status(400).json({ error: 'Ride is now full' });
      }
      if (ride.passengers.some((p) => p.toString() === jr.rider._id.toString())) {
        jr.status = 'accepted';
        await jr.save();
        return res.json(serializeJoinRequest(jr.toObject(), base));
      }
      ride.passengers.push(jr.rider._id);
      await ride.save();
      jr.status = 'accepted';
      await jr.save();
      let thread;
      try {
        thread = await ChatThread.create({
          ride: ride._id,
          rider: jr.rider._id,
          driver: ride.driver,
          messages: [],
        });
      } catch (err) {
        if (err && err.code === 11000) {
          thread = await ChatThread.findOne({ ride: ride._id, rider: jr.rider._id });
        } else throw err;
      }
      await createRiderNotification(
        jr.rider._id,
        'You’re in!',
        `The driver accepted your fare (PKR ${jr.currentFare}). Open chat to coordinate.`,
        ride._id,
        jr._id
      );
      const populated = await JoinRequest.findById(jr._id).populate('ride').populate('rider', 'name avatarPath').lean();
      const out = serializeJoinRequest(populated, base);
      out.chatThreadId = thread._id.toString();
      return res.json(out);
    }

    if (action === 'counter') {
      const cf = Number(counterFare);
      if (!Number.isFinite(cf) || cf <= 0) {
        return res.status(400).json({ error: 'counterFare must be a positive number' });
      }
      if (jr.proposedBy !== 'rider') {
        return res.status(400).json({ error: 'Wait for the rider’s move before countering again' });
      }
      jr.currentFare = Math.round(cf);
      jr.proposedBy = 'driver';
      jr.status = 'negotiating';
      await jr.save();
      await createRiderNotification(
        jr.rider._id,
        'Driver countered your fare',
        `The driver proposed PKR ${jr.currentFare}. Open the ride to accept or counter.`,
        jr.ride._id,
        jr._id
      );
      const populated = await JoinRequest.findById(jr._id).populate('ride').populate('rider', 'name avatarPath').lean();
      return res.json(serializeJoinRequest(populated, base));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Driver action failed' });
  }
});

app.post('/api/join-requests/:jrId/rider-action', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const jr = await JoinRequest.findById(req.params.jrId).populate('ride').populate('rider', 'name avatarPath');
    if (!jr || !jr.ride) return res.status(404).json({ error: 'Join request not found' });
    if (jr.rider._id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only the rider can use this action' });
    }
    const { action, counterFare } = req.body || {};
    const base = baseUrl(req);
    if (jr.status === 'accepted' || jr.status === 'rejected' || jr.status === 'withdrawn') {
      return res.status(400).json({ error: 'This request is closed' });
    }

    if (action === 'withdraw' || action === 'reject') {
      jr.status = 'withdrawn';
      await jr.save();
      return res.json(serializeJoinRequest(jr.toObject(), base));
    }

    if (action === 'accept') {
      if (jr.proposedBy !== 'driver') {
        return res.status(400).json({ error: 'Only the driver can accept your offer right now' });
      }
      const ride = await Ride.findById(jr.ride._id);
      if (ride.passengers.length >= ride.seatCount) {
        return res.status(400).json({ error: 'Ride is now full' });
      }
      if (ride.passengers.some((p) => p.toString() === jr.rider._id.toString())) {
        jr.status = 'accepted';
        await jr.save();
        return res.json(serializeJoinRequest(jr.toObject(), base));
      }
      ride.passengers.push(jr.rider._id);
      await ride.save();
      jr.status = 'accepted';
      await jr.save();
      let thread;
      try {
        thread = await ChatThread.create({
          ride: ride._id,
          rider: jr.rider._id,
          driver: ride.driver,
          messages: [],
        });
      } catch (err) {
        if (err && err.code === 11000) {
          thread = await ChatThread.findOne({ ride: ride._id, rider: jr.rider._id });
        } else throw err;
      }
      await createJoinNotification(
        ride.driver,
        'Rider accepted your fare',
        `${jr.rider.name} accepted PKR ${jr.currentFare}.`,
        ride._id,
        jr._id
      );
      const populated = await JoinRequest.findById(jr._id).populate('ride').populate('rider', 'name avatarPath').lean();
      const out = serializeJoinRequest(populated, base);
      out.chatThreadId = thread._id.toString();
      return res.json(out);
    }

    if (action === 'counter') {
      const cf = Number(counterFare);
      if (!Number.isFinite(cf) || cf <= 0) {
        return res.status(400).json({ error: 'counterFare must be a positive number' });
      }
      if (jr.proposedBy !== 'driver') {
        return res.status(400).json({ error: 'Wait for the driver’s offer before countering' });
      }
      jr.currentFare = Math.round(cf);
      jr.proposedBy = 'rider';
      jr.status = 'negotiating';
      await jr.save();
      await createJoinNotification(
        jr.ride.driver,
        'Rider countered your fare',
        `${jr.rider.name} proposed PKR ${jr.currentFare}.`,
        jr.ride._id,
        jr._id
      );
      const populated = await JoinRequest.findById(jr._id).populate('ride').populate('rider', 'name avatarPath').lean();
      return res.json(serializeJoinRequest(populated, base));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Rider action failed' });
  }
});

app.get('/api/chat/threads', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const uid = req.userId;
    const threads = await ChatThread.find({
      $or: [{ rider: uid }, { driver: uid }],
    })
      .populate('ride', 'from to when')
      .sort({ updatedAt: -1 })
      .lean();
    const base = baseUrl(req);
    res.json(threads.map((t) => serializeChatThread(t, base)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

app.get('/api/chat/threads/:tid', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const uid = req.userId;
    const t = await ChatThread.findOne({
      _id: req.params.tid,
      $or: [{ rider: uid }, { driver: uid }],
    })
      .populate('ride', 'from to when')
      .lean();
    if (!t) return res.status(404).json({ error: 'Thread not found' });
    const base = baseUrl(req);
    res.json(serializeChatThread(t, base));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load thread' });
  }
});

app.post('/api/chat/threads/:tid/messages', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const uid = req.userId;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Message text required' });
    if (text.length > 2000) return res.status(400).json({ error: 'Message too long' });
    const t = await ChatThread.findOne({
      _id: req.params.tid,
      $or: [{ rider: uid }, { driver: uid }],
    });
    if (!t) return res.status(404).json({ error: 'Thread not found' });
    t.messages.push({ from: uid, body: text, at: new Date() });
    await t.save();
    const lean = await ChatThread.findById(t._id).populate('ride', 'from to when').lean();
    const base = baseUrl(req);
    res.status(201).json(serializeChatThread(lean, base));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── GET /api/me/rides  — rides offered by the logged-in driver ──────────────
app.get('/api/me/rides', authMiddleware, async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.userId })
      .populate('driver', 'name email phone avatarPath cnic')
      .sort({ when: -1 })
      .lean();
    const base = baseUrl(req);
    res.json(rides.map((r) => serializeRide(r, base, { driverContact: true })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load your rides' });
  }
});

// ── DELETE /api/rides/:id  — driver cancels their ride ──────────────────────
app.delete('/api/rides/:id', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('driver', 'name');
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (!ride.driver) return res.status(404).json({ error: 'Ride driver not found' });
    if (ride.driver._id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only the driver can cancel this ride' });
    }
    if (ride.cancelled) return res.status(400).json({ error: 'Ride already cancelled' });

    ride.cancelled = true;
    await ride.save();

    // Cancel all open join requests and notify riders
    const openJRs = await JoinRequest.find({
      ride: ride._id,
      status: { $in: ['pending', 'negotiating'] },
    }).populate('rider', 'name');

    await JoinRequest.updateMany(
      { ride: ride._id, status: { $in: ['pending', 'negotiating'] } },
      { $set: { status: 'rejected' } }
    );

    for (const jr of openJRs) {
      if (jr.rider && jr.rider._id) {
        await Notification.create({
          user: jr.rider._id,
          kind: 'ride_cancelled',
          title: 'Ride cancelled',
          message: `The driver cancelled the ride from ${ride.from} to ${ride.to}.`,
          ride: ride._id,
          joinRequest: jr._id,
        });
      }
    }

    res.json({ ok: true, id: ride._id.toString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to cancel ride' });
  }
});

// ── POST /api/rides/:id/reviews  — submit a review after a ride ─────────────
app.post('/api/rides/:id/reviews', authMiddleware, requireAccountReady, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('driver', 'name');
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const uid = req.userId;
    const isDriver  = ride.driver._id.toString() === uid;
    const isPassenger = (ride.passengers || []).some((p) => p.toString() === uid);

    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: 'Only the driver or a passenger can leave a review' });
    }

    const { rating, comment, revieweeId } = req.body || {};
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be 1–5' });
    }
    if (!revieweeId) {
      return res.status(400).json({ error: 'revieweeId is required' });
    }

    // Validate reviewee is the other party
    if (isPassenger && ride.driver._id.toString() !== revieweeId) {
      return res.status(400).json({ error: 'Passengers can only review the driver' });
    }
    if (isDriver && !(ride.passengers || []).some((p) => p.toString() === revieweeId)) {
      return res.status(400).json({ error: 'Driver can only review their passengers' });
    }

    const review = await Review.create({
      ride: ride._id,
      reviewer: uid,
      reviewee: revieweeId,
      rating: Math.round(r),
      comment: String(comment || '').trim().slice(0, 500),
      role: isPassenger ? 'driver' : 'rider',
    });

    // Update reviewee's cached rating on User doc (optional denorm)
    const stats = await Review.aggregate([
      { $match: { reviewee: review.reviewee } },
      { $group: { _id: '$reviewee', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (stats.length) {
      await User.findByIdAndUpdate(review.reviewee, {
        ratingAvg: Math.round(stats[0].avg * 10) / 10,
        ratingCount: stats[0].count,
      });
    }

    res.status(201).json({
      id: review._id.toString(),
      rideId: ride._id.toString(),
      reviewerId: uid,
      revieweeId: revieweeId,
      rating: review.rating,
      comment: review.comment,
      role: review.role,
      createdAt: review.createdAt,
    });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: 'You have already reviewed this ride' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ── GET /api/users/:id/reviews  — reviews received by a user ────────────────
app.get('/api/users/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewee: req.params.id })
      .populate('reviewer', 'name avatarPath')
      .populate('ride', 'from to when')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const base = baseUrl(req);
    res.json(reviews.map((rv) => ({
      id: rv._id.toString(),
      rating: rv.rating,
      comment: rv.comment,
      role: rv.role,
      createdAt: rv.createdAt,
      ride: rv.ride ? { id: rv.ride._id.toString(), from: rv.ride.from, to: rv.ride.to, when: rv.ride.when } : null,
      reviewer: rv.reviewer ? {
        id: rv.reviewer._id.toString(),
        name: rv.reviewer.name,
        avatarUrl: rv.reviewer.avatarPath ? `${base}${rv.reviewer.avatarPath}` : null,
      } : null,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && /json/i.test(String(err.message)))) {
    console.warn('Invalid JSON body:', req.method, req.url);
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  next(err);
});

async function start() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    console.error('Set MONGODB_URI and JWT_SECRET in server/.env');
    process.exit(1);
  }
  if (
    process.env.MONGODB_URI.includes('YOUR_DB_USER') ||
    process.env.MONGODB_URI.includes('YOUR_DB_PASSWORD')
  ) {
    console.error(
      'Edit server/.env: replace YOUR_DB_USER and YOUR_DB_PASSWORD with your Atlas database user and password.'
    );
    process.exit(1);
  }
  ensureUploadDirs();
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  });
  try {
    const mig = await User.updateMany(
      { cnicDocumentPath: null },
      [
        {
          $set: {
            emailVerified: true,
            phoneVerified: true,
            cnicDocumentPath: { $ifNull: ['$cnicDocumentPath', '$avatarPath'] },
          },
        },
      ]
    );
    if (mig.modifiedCount) {
      console.log(`Migrated ${mig.modifiedCount} legacy user(s): verification + CNIC doc path.`);
    }
  } catch (mErr) {
    console.warn('Legacy user migration skipped:', mErr.message || mErr);
  }
  app.listen(PORT, HOST, () => {
    console.log(`Listening on ${HOST}:${PORT}`);
    logListenUrls();
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
