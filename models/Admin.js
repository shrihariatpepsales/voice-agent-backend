const mongoose = require('mongoose');

/**
 * Admin Schema
 * 
 * Singleton model for storing Google OAuth tokens.
 * There should always be exactly one admin record in the database.
 * When OAuth tokens are received, they are stored/updated in this single record.
 */
const AdminSchema = new mongoose.Schema(
  {
    // Admin email (from Google OAuth)
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
      // unique: true removed - using schema.index() instead to avoid duplicate index warning
    },
    // Admin name (from Google OAuth)
    name: {
      type: String,
      trim: true,
    },
    // Google OAuth access token
    access_token: {
      type: String,
      required: true,
      trim: true,
    },
    // Google OAuth refresh token (for token renewal)
    refresh_token: {
      type: String,
      trim: true,
    },
    // Token expiry timestamp
    token_expiry: {
      type: Date,
    },
    // Last time tokens were updated
    tokens_updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one admin document exists
AdminSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

