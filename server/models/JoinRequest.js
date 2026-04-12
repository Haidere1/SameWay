const mongoose = require('mongoose');

const STATUSES = ['pending', 'negotiating', 'accepted', 'rejected', 'withdrawn'];

const joinRequestSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    /** Latest fare amount under discussion (PKR or your unit). */
    currentFare: { type: Number, required: true, min: 0 },
    /** Who proposed currentFare last — the other side must accept or counter. */
    proposedBy: { type: String, enum: ['rider', 'driver'], required: true },
  },
  { timestamps: true }
);

joinRequestSchema.index({ ride: 1, rider: 1 });

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
