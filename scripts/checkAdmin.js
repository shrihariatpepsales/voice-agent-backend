/**
 * Script to check if admin OAuth tokens are stored correctly in the database
 * Run with: node scripts/checkAdmin.js
 */

require('dotenv').config();
const { connectToDatabase } = require('../db');
const Admin = require('../models/Admin');

async function checkAdmin() {
  try {
    console.log('Connecting to database...');
    await connectToDatabase();
    console.log('✓ Connected to database\n');

    // Find admin record
    const admin = await Admin.findOne().lean().exec();

    if (!admin) {
      console.log('❌ No admin record found in database');
      return;
    }

    console.log('✓ Admin record found!\n');
    console.log('Admin Details:');
    console.log('─'.repeat(50));
    console.log(`Email:        ${admin.email}`);
    console.log(`Name:         ${admin.name || 'N/A'}`);
    console.log(`Access Token: ${admin.access_token ? `✓ Present (${admin.access_token.substring(0, 20)}...)` : '❌ Missing'}`);
    console.log(`Refresh Token: ${admin.refresh_token ? `✓ Present (${admin.refresh_token.substring(0, 20)}...)` : '❌ Missing'}`);
    console.log(`Token Expiry:  ${admin.token_expiry ? new Date(admin.token_expiry).toISOString() : 'N/A'}`);
    console.log(`Tokens Updated: ${admin.tokens_updated_at ? new Date(admin.tokens_updated_at).toISOString() : 'N/A'}`);
    console.log(`Created At:    ${admin.createdAt ? new Date(admin.createdAt).toISOString() : 'N/A'}`);
    console.log(`Updated At:    ${admin.updatedAt ? new Date(admin.updatedAt).toISOString() : 'N/A'}`);
    console.log('─'.repeat(50));

    // Validate token expiry
    if (admin.token_expiry) {
      const now = new Date();
      const expiry = new Date(admin.token_expiry);
      const isValid = now < expiry;
      const timeUntilExpiry = expiry - now;
      const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
      const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));

      console.log(`\nToken Status:`);
      console.log(`  Valid: ${isValid ? '✓ Yes' : '❌ Expired'}`);
      if (isValid) {
        console.log(`  Expires in: ${hoursUntilExpiry}h ${minutesUntilExpiry}m`);
      } else {
        console.log(`  Expired: ${Math.abs(hoursUntilExpiry)}h ${Math.abs(minutesUntilExpiry)}m ago`);
      }
    }

    // Check if all required fields are present
    const hasRequiredFields = admin.email && admin.access_token;
    console.log(`\nValidation:`);
    console.log(`  Required fields present: ${hasRequiredFields ? '✓ Yes' : '❌ No'}`);

    // Count total admin records (should be 1 for singleton)
    const adminCount = await Admin.countDocuments();
    console.log(`  Total admin records: ${adminCount} ${adminCount === 1 ? '✓ (Singleton)' : '⚠️  (Expected 1)'}`);

    console.log('\n✓ Check complete!');
  } catch (error) {
    console.error('❌ Error checking admin:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkAdmin();

