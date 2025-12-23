const transporter = require('../config/mailTransporter');
const appointmentConfirmationTemplate = require('../templates/appointmentConfirmationTemplate');

/**
 * Sends appointment confirmation email to the patient.
 * 
 * @param {Object} appointmentData - Appointment data from database
 * @param {string} appointmentData.name - Patient name
 * @param {number} appointmentData.age - Patient age
 * @param {string} appointmentData.contactNumber - Contact phone number
 * @param {string} appointmentData.medicalConcern - Medical concern/reason for visit
 * @param {Date} appointmentData.appointmentDateTime - Appointment date and time
 * @param {string} appointmentData.email - Patient email address (required for this function)
 * @param {string|null} appointmentData.doctorPreference - Preferred doctor (optional)
 * @returns {Promise<Object>} Email send result
 */
async function sendAppointmentConfirmationEmail(appointmentData) {
  const { email, name } = appointmentData;

  // Validate email is provided
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    throw new Error('Email address is required to send confirmation email');
  }

  // Build email subject
  const subject = 'Your Appointment Is Confirmed';

  // Generate HTML email template
  const html = appointmentConfirmationTemplate(appointmentData);

  // Email options
  const mailOptions = {
    from: `"Hospital Appointments" <${process.env.EMAIL_USER}>`,
    to: email.trim(),
    subject: subject,
    html: html,
  };

  try {
    // Send email using transporter
    const info = await transporter.sendMail(mailOptions);
    console.log('[emailService] Appointment confirmation email sent successfully', {
      to: email,
      messageId: info.messageId,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Log error details for debugging
    console.error('[emailService] Failed to send appointment confirmation email', {
      to: email,
      error: error.message,
      stack: error.stack,
    });
    // Re-throw to allow caller to handle
    throw error;
  }
}

module.exports = {
  sendAppointmentConfirmationEmail,
};

