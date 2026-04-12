const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    when: { type: Date, required: true },
    seatCount: { type: Number, required: true, min: 1, max: 8 },
    passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    fromLat: { type: Number, default: null },
    fromLng: { type: Number, default: null },
    toLat: { type: Number, default: null },
    toLng: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ride', rideSchema);
