/**
 * Generates HTML email template for appointment confirmation.
 * 
 * @param {Object} data - Appointment data
 * @param {string} data.name - Patient name
 * @param {number} data.age - Patient age
 * @param {string} data.contactNumber - Contact phone number
 * @param {string} data.medicalConcern - Medical concern/reason for visit
 * @param {Date} data.appointmentDateTime - Appointment date and time
 * @param {string|null} data.email - Patient email (if provided)
 * @param {string|null} data.doctorPreference - Preferred doctor (if provided)
 * @returns {string} HTML email content
 */
function appointmentConfirmationTemplate(data) {
  const {
    name,
    age,
    contactNumber,
    medicalConcern,
    appointmentDateTime,
    doctorPreference,
  } = data;

  // Format appointment date and time nicely
  const appointmentDate = new Date(appointmentDateTime);
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
    <h1 style="color: #2c3e50; margin-top: 0;">Your Appointment Is Confirmed</h1>
  </div>
  
  <div style="background-color: #ffffff; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Dear ${name},</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      We're pleased to confirm your appointment with us. Below are your appointment details:
    </p>
    
    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
      <h2 style="color: #2c3e50; margin-top: 0; font-size: 18px;">Appointment Details</h2>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 40%;">Patient Name:</td>
          <td style="padding: 8px 0;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Age:</td>
          <td style="padding: 8px 0;">${age}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Medical Concern:</td>
          <td style="padding: 8px 0;">${medicalConcern}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Date & Time:</td>
          <td style="padding: 8px 0; color: #27ae60; font-size: 16px; font-weight: bold;">
            ${formattedDate} at ${formattedTime}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Contact Number:</td>
          <td style="padding: 8px 0;">${contactNumber}</td>
        </tr>
        ${doctorPreference ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Doctor Preference:</td>
          <td style="padding: 8px 0;">${doctorPreference}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p style="font-size: 16px; margin-top: 20px;">
      Please arrive 10-15 minutes before your scheduled appointment time. If you need to reschedule or cancel, please contact us at ${contactNumber}.
    </p>
    
    <p style="font-size: 16px; margin-top: 20px;">
      We look forward to seeing you.
    </p>
    
    <p style="font-size: 16px; margin-top: 20px;">
      Best regards,<br>
      <strong>Hospital Appointments Team</strong>
    </p>
  </div>
  
  <div style="margin-top: 20px; padding: 15px; background-color: #ecf0f1; border-radius: 5px; font-size: 12px; color: #7f8c8d; text-align: center;">
    <p style="margin: 0;">This is an automated confirmation email. Please do not reply to this message.</p>
  </div>
</body>
</html>
  `.trim();
}

module.exports = appointmentConfirmationTemplate;

