const { connectToDatabase } = require('../db');
const Admin = require('../models/Admin');

/**
 * Admin Service
 * 
 * Manages the singleton admin record and Google OAuth tokens.
 * Ensures there's always exactly one admin record in the database.
 */

/**
 * Get the admin record (singleton)
 * @returns {Promise<Object|null>} Admin document or null if not found
 */
async function getAdmin() {
  await connectToDatabase();
  return Admin.findOne().lean().exec();
}

/**
 * Update or create admin with OAuth tokens
 * Implements singleton pattern: ensures there's always exactly one admin record
 * 
 * @param {Object} adminData - Admin data including OAuth tokens
 * @param {string} adminData.email - Admin email
 * @param {string} adminData.name - Admin name (optional)
 * @param {string} adminData.access_token - Google OAuth access token
 * @param {string} adminData.refresh_token - Google OAuth refresh token (optional)
 * @param {Date} adminData.token_expiry - Token expiry date (optional)
 * @returns {Promise<Object>} Updated admin document
 */
async function updateAdminTokens({ email, name, access_token, refresh_token, token_expiry }) {
  await connectToDatabase();

  if (!email || !access_token) {
    throw new Error('Email and access_token are required');
  }

  const updateData = {
    email: email.toLowerCase(),
    access_token,
    tokens_updated_at: new Date(),
  };

  // Only update fields that are provided
  if (name) {
    updateData.name = name;
  }
  if (refresh_token) {
    updateData.refresh_token = refresh_token;
  }
  if (token_expiry) {
    updateData.token_expiry = token_expiry;
  }

  // Singleton pattern: Find any existing admin or create one
  // Using empty filter ensures we always work with the single admin record
  // If multiple admins exist (shouldn't happen), this updates the first one
  const admin = await Admin.findOneAndUpdate(
    {}, // Empty filter matches any admin (singleton pattern)
    { $set: updateData },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      // Sort by creation date to ensure consistency if multiple records exist
      sort: { createdAt: 1 },
    }
  );

  // Ensure singleton: delete any other admin records (safety check)
  // This should rarely execute, but ensures data integrity
  await Admin.deleteMany({
    _id: { $ne: admin._id },
  }).catch((err) => {
    // Log but don't fail if cleanup encounters issues
    console.warn('[adminService] Warning: Could not clean up duplicate admin records:', err.message);
  });

  return admin;
}

/**
 * Check if admin tokens are valid (not expired)
 * @returns {Promise<boolean>} True if tokens exist and are valid
 */
async function hasValidTokens() {
  const admin = await getAdmin();
  if (!admin || !admin.access_token) {
    return false;
  }

  // Check if token is expired
  if (admin.token_expiry && new Date() >= new Date(admin.token_expiry)) {
    return false;
  }

  return true;
}

/**
 * Get admin access token
 * @returns {Promise<string|null>} Access token or null if not available
 */
async function getAccessToken() {
  const admin = await getAdmin();
  return admin?.access_token || null;
}

module.exports = {
  getAdmin,
  updateAdminTokens,
  hasValidTokens,
  getAccessToken,
};

