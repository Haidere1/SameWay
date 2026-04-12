const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const chatThreadSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messages: [messageSchema],
  },
  { timestamps: true }
);

chatThreadSchema.index({ ride: 1, rider: 1 }, { unique: true });

module.exports = mongoose.model('ChatThread', chatThreadSchema);
