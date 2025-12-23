const express = require('express');
const { scheduleMeeting } = require('../services/googleCalendar');

const router = express.Router();

/**
 * POST /schedule-meeting
 * 
 * Schedules a Google Calendar meeting using stored refresh token.
 * No user authentication required - uses admin's stored refresh token.
 * 
 * Request Body (optional - uses defaults if not provided):
 * {
 *   summary: "Test Appointment",
 *   description: "Booked via backend API using stored refresh token",
 *   startDateTime: "2025-12-24T12:00:00+05:30",
 *   endDateTime: "2025-12-24T12:30:00+05:30",
 *   timezone: "Asia/Kolkata",
 *   calendarId: "primary"
 * }
 * 
 * Response (success):
 * {
 *   success: true,
 *   eventId: "event_id_from_google",
 *   meetingLink: "https://meet.google.com/...",
 *   start: "2025-12-24T12:00:00+05:30",
 *   end: "2025-12-24T12:30:00+05:30",
 *   htmlLink: "https://www.google.com/calendar/event?eid=...",
 *   summary: "Test Appointment"
 * }
 * 
 * Response (error):
 * {
 *   success: false,
 *   error: "Error message"
 * }
 */
router.post('/schedule-meeting', async (req, res) => {
  try {
    // Extract event details from request body (with defaults)
    const {
      summary = 'Test Appointment',
      description = 'Booked via backend API using stored refresh token',
      startDateTime = '2025-12-24T12:00:00+05:30',
      endDateTime = '2025-12-24T12:30:00+05:30',
      timezone = 'Asia/Kolkata',
      calendarId = 'primary',
    } = req.body || {};

    // Validate datetime format (basic ISO 8601 check)
    const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
    if (!isoDateTimeRegex.test(startDateTime) || !isoDateTimeRegex.test(endDateTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid datetime format. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss±HH:mm (e.g., 2025-12-24T12:00:00+05:30)',
      });
    }

    // Validate that end time is after start time
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        error: 'End datetime must be after start datetime',
      });
    }

    // Schedule the meeting
    const result = await scheduleMeeting({
      summary,
      description,
      startDateTime,
      endDateTime,
      timezone,
      calendarId,
    });

    // Log successful scheduling
    console.log('[calendar] Meeting scheduled successfully:', {
      eventId: result.eventId,
      summary: result.summary,
      start: result.start,
      end: result.end,
    });

    // Return success response
    return res.status(200).json({
      success: true,
      eventId: result.eventId,
      meetingLink: result.meetingLink,
      start: result.start,
      end: result.end,
      htmlLink: result.htmlLink,
      summary: result.summary,
    });
  } catch (error) {
    // Handle different error types
    const errorMessage = error.message || 'Failed to schedule meeting';

    // Log error with context
    console.error('[calendar] Error scheduling meeting:', {
      error: errorMessage,
      stack: error.stack,
    });

    // Determine appropriate status code based on error type
    let statusCode = 500;
    if (errorMessage.includes('not found') || errorMessage.includes('not configured')) {
      statusCode = 500; // Server configuration error
    } else if (errorMessage.includes('Invalid') || errorMessage.includes('must be')) {
      statusCode = 400; // Client error
    } else if (errorMessage.includes('unauthorized') || errorMessage.includes('permission')) {
      statusCode = 403; // Permission error
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
    });
  }
});

module.exports = router;

