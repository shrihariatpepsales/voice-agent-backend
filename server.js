require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const { connectToDatabase } = require('./db');
const ConversationEntry = require('./models/ConversationEntry');
const Booking = require('./models/Booking');
const { sendAppointmentConfirmationEmail } = require('./services/emailService');
const { scheduleMeeting, formatAppointmentDateTime } = require('./services/googleCalendar');

const { initWebSocketServer } = require('./websocket');

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes (login/signup with email or phone)
app.use('/api/auth', authRoutes);
// Google OAuth routes (mounted at /auth for OAuth redirect compatibility)
app.use('/auth', authRoutes);
// Calendar routes (Google Calendar meeting scheduling)
app.use('/', calendarRoutes);

// Get conversation history for a browser session
app.get('/api/conversations/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    await connectToDatabase();

    const docs = await ConversationEntry.find({
      browserSessionId: sessionId,
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    /**
     * Check if text contains curly braces (opening or closing).
     * Used to filter out JSON fragments or malformed responses before sending to frontend.
     */
    function containsCurlyBraces(text) {
      if (!text || typeof text !== 'string') return false;
      return text.includes('{') || text.includes('}');
    }

    const entries = docs.map((doc) => {
      // Filter out agent responses containing curly braces before returning to frontend
      const sanitizedAgentText = containsCurlyBraces(doc.agentText) ? '' : doc.agentText;
      return {
        timestamp: doc.createdAt.toISOString(),
        transcript: doc.userText,
        llm_response: sanitizedAgentText,
        browser_session_id: doc.browserSessionId,
        mode: doc.mode,
        user_id: doc.user ? doc.user.toString() : null,
      };
    });

    return res.json({ session_id: sessionId, entries });
  } catch (err) {
    console.error('[server] error reading conversations from db', err);
    return res.status(500).json({ error: 'Failed to read conversations' });
  }
});

// Create a new booking from structured JSON payload
// POST /book-appointment
// Body:
// {
//   action: "book_appointment",
//   payload: {
//     name, age, contact_number, medical_concern,
//     appointment_datetime, email, doctor_preference
//   },
//   metadata: {
//     browser_session_id, user_id, user_type, conversation_session_id
//   }
// }
app.post('/book-appointment', async (req, res) => {
  try {
    const { action, payload, metadata } = req.body || {};

    if (action !== 'book_appointment' || !payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid action or payload' });
    }

    const {
      name,
      age,
      contact_number: contactNumber,
      medical_concern: medicalConcern,
      appointment_datetime: appointmentDateTimeRaw,
      email = null,
      doctor_preference: doctorPreference = null,
    } = payload;

    if (!name || !contactNumber || !medicalConcern || !appointmentDateTimeRaw || typeof age !== 'number') {
      return res.status(400).json({ error: 'Missing required booking fields' });
    }

    const browserSessionId =
      (metadata && metadata.browser_session_id) || req.headers['x-browser-session-id'] || null;

    if (!browserSessionId) {
      return res.status(400).json({ error: 'browser_session_id is required in metadata' });
    }

    // Extract user timezone from metadata, fallback to Asia/Kolkata
    const userTimezone = (metadata && metadata.timezone) || 'Asia/Kolkata';

    let appointmentDate;
    try {
      appointmentDate = new Date(appointmentDateTimeRaw);
      if (Number.isNaN(appointmentDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch {
      return res.status(400).json({ error: 'appointment_datetime must be a valid ISO date string' });
    }

    await connectToDatabase();

    const booking = await Booking.create({
      browserSessionId,
      user: metadata && metadata.user_id ? metadata.user_id : null,
      name,
      age,
      contactNumber,
      medicalConcern,
      appointmentDateTime: appointmentDate,
      email,
      doctorPreference,
      status: 'confirmed',
    });

    // Send confirmation email and schedule calendar meeting if email is provided
    if (email && typeof email === 'string' && email.trim().length > 0) {
      // Convert booking document to plain object for email service
      const bookingData = {
        name: booking.name,
        age: booking.age,
        contactNumber: booking.contactNumber,
        medicalConcern: booking.medicalConcern,
        appointmentDateTime: booking.appointmentDateTime,
        email: booking.email,
        doctorPreference: booking.doctorPreference || null,
      };

      try {
        // Send email first - await to ensure it succeeds before scheduling calendar
        await sendAppointmentConfirmationEmail(bookingData);

        // Only schedule calendar meeting if email was sent successfully
        try {
          console.log('[server] Attempting to schedule calendar meeting...', {
            bookingId: booking._id.toString(),
            appointmentDateTime: booking.appointmentDateTime,
            email: email,
          });

          // Format appointment datetime for Google Calendar (use current year, add 30 mins)
          // Use user's timezone from metadata, fallback to Asia/Kolkata
          const { startDateTime, endDateTime } = formatAppointmentDateTime(
            booking.appointmentDateTime,
            userTimezone
          );

          console.log('[server] Formatted datetime for calendar:', {
            startDateTime,
            endDateTime,
          });

          // Create event summary and description (matching email template style)
          const eventSummary = `Hospital Appointment - ${booking.name}`;
          const eventDescription = [
            `Hospital Appointment Confirmation`,
            ``,
            `Patient Details:`,
            `Patient Name: ${booking.name}`,
            `Age: ${booking.age}`,
            `Contact Number: ${booking.contactNumber}`,
            ``,
            `Appointment Details:`,
            `Medical Concern: ${booking.medicalConcern}`,
            booking.doctorPreference ? `Preferred Doctor: ${booking.doctorPreference}` : null,
            ``,
            `Please arrive 10-15 minutes before your scheduled appointment time.`,
            ``,
            `Best regards,`,
            `Hospital Appointments Team`,
          ]
            .filter(Boolean)
            .join('\n');

          // Schedule calendar meeting with patient email as attendee
          // Use user's timezone from metadata, fallback to Asia/Kolkata
          const calendarResult = await scheduleMeeting({
            summary: eventSummary,
            description: eventDescription,
            startDateTime,
            endDateTime,
            timezone: userTimezone,
            calendarId: 'primary',
            attendees: [email], // Add patient email as attendee
          });

          console.log('[server] Calendar meeting scheduled successfully', {
            bookingId: booking._id.toString(),
            eventId: calendarResult.eventId,
            meetingLink: calendarResult.meetingLink,
            start: calendarResult.start,
            end: calendarResult.end,
          });
        } catch (calendarError) {
          // Log calendar error with full details but don't fail the booking (email was sent successfully)
          console.error('[server] Failed to schedule calendar meeting (booking and email still successful)', {
            bookingId: booking._id.toString(),
            email: email,
            error: calendarError.message || String(calendarError),
            stack: calendarError.stack,
          });
        }
      } catch (emailError) {
        // Log email error but don't fail the booking
        console.error('[server] Failed to send confirmation email (booking still successful)', {
          bookingId: booking._id.toString(),
          email: email,
          error: emailError.message,
        });
        // Don't schedule calendar meeting if email failed
      }
    }

    return res.status(200).json({
      success: true,
      bookingId: booking._id.toString(),
      booking,
    });
  } catch (err) {
    console.error('[server] error creating booking', err);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
});

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Attach WebSocket server
initWebSocketServer(server);

server.listen(PORT, () => {
  // Minimal but useful log
  console.log(`[server] HTTP + WebSocket listening on http://localhost:${PORT}`);
});


