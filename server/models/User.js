const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    cnic: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, required: true, trim: true },
    avatarPath: { type: String, default: null },
    /** Scanned CNIC card image (separate from profile photo). */
    cnicDocumentPath: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    emailVerifyCode: { type: String, default: null },
    emailVerifyExpires: { type: Date, default: null },
    phoneVerifyCode: { type: String, default: null },
    phoneVerifyExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
