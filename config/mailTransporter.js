const nodemailer = require('nodemailer');

/**
 * Creates and exports a Nodemailer transporter configured for Gmail SMTP.
 * Uses EMAIL_USER and EMAIL_PASS from environment variables.
 * EMAIL_PASS should be a Gmail App Password (not the regular Gmail password).
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password
  },
});

module.exports = transporter;

