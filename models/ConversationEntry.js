const mongoose = require('mongoose');

const ConversationEntrySchema = new mongoose.Schema(
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
    mode: {
      type: String,
      enum: ['voice', 'chat'],
      required: true,
    },
    userText: {
      type: String,
      required: true,
      trim: true,
    },
    agentText: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ConversationEntrySchema.index({ browserSessionId: 1, createdAt: 1 });

module.exports =
  mongoose.models.ConversationEntry ||
  mongoose.model('ConversationEntry', ConversationEntrySchema);



