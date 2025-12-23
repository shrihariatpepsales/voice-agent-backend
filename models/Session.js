const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    browserSessionId: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

SessionSchema.index({ browserSessionId: 1, user: 1 }, { unique: true });

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);


