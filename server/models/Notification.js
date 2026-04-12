const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', default: null },
    joinRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'JoinRequest', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
