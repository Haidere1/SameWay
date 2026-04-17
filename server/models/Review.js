const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    ride:     { type: mongoose.Schema.Types.ObjectId, ref: 'Ride',  required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    rating:   { type: Number, required: true, min: 1, max: 5 },
    comment:  { type: String, trim: true, maxlength: 500, default: '' },
    /** 'driver' = reviewer is rating the driver; 'rider' = driver is rating the rider */
    role:     { type: String, enum: ['driver', 'rider'], required: true },
  },
  { timestamps: true }
);

// One review per (ride, reviewer) pair
reviewSchema.index({ ride: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
