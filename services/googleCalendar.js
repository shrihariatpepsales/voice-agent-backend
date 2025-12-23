const { google } = require('googleapis');
const { getAdmin } = require('./adminService');

/**
 * Get timezone offset in ISO 8601 format (e.g., '+05:30', '-05:00')
 * Supports IANA timezone names and UTC offsets
 * 
 * @param {string} timezone - IANA timezone name (e.g., 'Asia/Kolkata') or UTC offset (e.g., 'UTC+05:30')
 * @param {Date} date - Date to calculate offset for (defaults to now)
 * @returns {string} ISO 8601 timezone offset string
 */
function getTimezoneOffset(timezone, date = new Date()) {
  // If already in offset format (e.g., 'UTC+05:30', '+05:30'), extract and return
  if (timezone.startsWith('UTC') || /^[+-]\d{2}:\d{2}$/.test(timezone)) {
    const offsetMatch = timezone.match(/([+-])(\d{2}):(\d{2})/);
    if (offsetMatch) {
      return `${offsetMatch[1]}${offsetMatch[2]}:${offsetMatch[3]}`;
    }
  }

  // For IANA timezone names, calculate offset using Intl API
  try {
    // Create formatters for UTC and target timezone
    const utcFormatter = new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const tzFormatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Format the same date in both timezones
    const utcParts = utcFormatter.formatToParts(date);
    const tzParts = tzFormatter.formatToParts(date);

    const getValue = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

    // Create Date objects from the formatted parts
    const utcDate = new Date(
      Date.UTC(
        getValue(utcParts, 'year'),
        getValue(utcParts, 'month') - 1,
        getValue(utcParts, 'day'),
        getValue(utcParts, 'hour'),
        getValue(utcParts, 'minute'),
        getValue(utcParts, 'second')
      )
    );

    const tzDate = new Date(
      Date.UTC(
        getValue(tzParts, 'year'),
        getValue(tzParts, 'month') - 1,
        getValue(tzParts, 'day'),
        getValue(tzParts, 'hour'),
        getValue(tzParts, 'minute'),
        getValue(tzParts, 'second')
      )
    );

    // Calculate offset in minutes
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? '+' : '-';

    return `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
  } catch (error) {
    console.warn(`[googleCalendar] Failed to calculate offset for timezone ${timezone}, using fallback:`, error.message);
  }

  // Fallback: use comprehensive mapping for common timezones
  const timezoneOffsets = {
    'Asia/Kolkata': '+05:30',
    'America/New_York': '-05:00', // EST/EDT (simplified, doesn't account for DST)
    'America/Los_Angeles': '-08:00', // PST/PDT
    'Europe/London': '+00:00', // GMT/BST
    'America/Chicago': '-06:00', // CST/CDT
    'America/Denver': '-07:00', // MST/MDT
    'America/Phoenix': '-07:00', // MST (no DST)
    'America/Toronto': '-05:00', // EST/EDT
    'Europe/Paris': '+01:00', // CET/CEST
    'Asia/Tokyo': '+09:00',
    'Asia/Shanghai': '+08:00',
    'Australia/Sydney': '+10:00', // AEST/AEDT
    'America/Sao_Paulo': '-03:00', // BRT/BRST
    'Asia/Dubai': '+04:00',
    'Europe/Moscow': '+03:00',
  };

  return timezoneOffsets[timezone] || '+05:30'; // Default to IST
}

/**
 * Google Calendar Service
 * 
 * Handles Google Calendar operations using stored OAuth refresh token.
 * Automatically refreshes access tokens as needed.
 */

/**
 * Get authenticated Google Calendar API client
 * Uses refresh token from admin record to authenticate
 * 
 * @returns {Promise<Object>} Authenticated calendar API client
 * @throws {Error} If admin record not found or refresh token missing
 */
async function getCalendarClient() {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  }

  // Get admin record with refresh token
  const admin = await getAdmin();
  if (!admin) {
    throw new Error('Admin record not found in database. Please complete Google OAuth setup first.');
  }

  if (!admin.refresh_token) {
    throw new Error('Refresh token not found in admin record. Please complete Google OAuth setup again to obtain a refresh token.');
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    // Redirect URI (not used for refresh token flow, but required by OAuth2 client)
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
  );

  // Set credentials using refresh token and access token (if available)
  // The SDK will automatically refresh the access token when needed
  const credentials = {
    refresh_token: admin.refresh_token,
  };

  // Include access token if available and not expired
  if (admin.access_token) {
    const isExpired = admin.token_expiry && new Date() >= new Date(admin.token_expiry);
    if (!isExpired) {
      credentials.access_token = admin.access_token;
    }
  }

  oauth2Client.setCredentials(credentials);

  // Create and return Calendar API client
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  return calendar;
}

/**
 * Schedule a Google Calendar meeting
 * 
 * @param {Object} eventDetails - Event details
 * @param {string} eventDetails.summary - Event title/summary
 * @param {string} eventDetails.description - Event description
 * @param {string} eventDetails.startDateTime - ISO 8601 datetime string (e.g., '2025-12-24T12:00:00+05:30')
 * @param {string} eventDetails.endDateTime - ISO 8601 datetime string (e.g., '2025-12-24T12:30:00+05:30')
 * @param {string} eventDetails.timezone - Timezone (e.g., 'Asia/Kolkata')
 * @param {string} eventDetails.calendarId - Calendar ID (default: 'primary')
 * @param {string[]} eventDetails.attendees - Array of attendee email addresses (optional)
 * @returns {Promise<Object>} Created event with eventId, meetingLink, start, end
 * @throws {Error} If event creation fails
 */
async function scheduleMeeting({
  summary = 'Test Appointment',
  description = 'Booked via backend API using stored refresh token',
  startDateTime = '2025-12-24T12:00:00+05:30',
  endDateTime = '2025-12-24T12:30:00+05:30',
  timezone = 'Asia/Kolkata',
  calendarId = 'primary',
  attendees = [],
}) {
  try {
    const calendar = await getCalendarClient();

    // Create event object
    const event = {
      summary,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: timezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: timezone,
      },
      // Enable Google Meet link generation
      conferenceData: {
        createRequest: {
          requestId: `meeting-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
    };

    // Add attendees if provided
    if (attendees && attendees.length > 0) {
      event.attendees = attendees.map((email) => ({
        email: email.trim(),
      }));
    }

    // Insert event into calendar
    const response = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1, // Required for Google Meet link generation
      requestBody: event,
      sendUpdates: attendees && attendees.length > 0 ? 'all' : 'none', // Send calendar invites to attendees
    });

    const createdEvent = response.data;

    // Extract meeting link from conference data
    const meetingLink = createdEvent.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === 'video'
    )?.uri || null;

    return {
      eventId: createdEvent.id,
      meetingLink,
      start: createdEvent.start.dateTime || createdEvent.start.date,
      end: createdEvent.end.dateTime || createdEvent.end.date,
      htmlLink: createdEvent.htmlLink,
      summary: createdEvent.summary,
    };
  } catch (error) {
    // Enhance error messages for better debugging
    if (error.response) {
      // Google API error
      const errorMessage = error.response.data?.error?.message || error.message;
      const errorCode = error.response.status;
      throw new Error(`Google Calendar API error (${errorCode}): ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Format appointment datetime for Google Calendar
 * Extracts date and time from appointment datetime and uses current year
 * Adds 30 minutes to start time for end time
 * 
 * @param {Date} appointmentDateTime - Appointment date/time
 * @param {string} timezone - Timezone (default: 'Asia/Kolkata')
 * @returns {Object} Object with startDateTime and endDateTime in ISO 8601 format
 */
function formatAppointmentDateTime(appointmentDateTime, timezone = 'Asia/Kolkata') {
  const appointmentDate = new Date(appointmentDateTime);
  const currentYear = new Date().getFullYear();

  // Convert the UTC datetime to the target timezone first, then extract local time components
  // This ensures we get the correct local time (e.g., 8am IST, not 2:30am IST)
  let month, day, hours, minutes;

  try {
    // Use Intl.DateTimeFormat to get local time components in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(appointmentDate);
    const getValue = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

    month = getValue('month') - 1; // Convert to 0-11
    day = getValue('day');
    hours = getValue('hour');
    minutes = getValue('minute');
  } catch (error) {
    // Fallback: if timezone conversion fails, use UTC components
    // This should rarely happen, but provides a safety net
    console.warn(`[googleCalendar] Failed to convert to timezone ${timezone}, using UTC fallback:`, error.message);
    month = appointmentDate.getUTCMonth();
    day = appointmentDate.getUTCDate();
    hours = appointmentDate.getUTCHours();
    minutes = appointmentDate.getUTCMinutes();
  }

  // Get timezone offset in ISO 8601 format
  const timezoneOffset = getTimezoneOffset(timezone, appointmentDate);

  // Format date components as ISO 8601 string
  const formatDateTime = (year, month, day, hours, minutes) => {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}:00${timezoneOffset}`;
  };

  // Calculate end time (30 minutes after start time)
  let endHours = hours;
  let endMinutes = minutes + 30;
  let endDay = day;
  let endMonth = month;
  let endYear = currentYear;

  // Handle minute overflow
  if (endMinutes >= 60) {
    endHours += Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
  }

  // Handle hour overflow
  if (endHours >= 24) {
    endDay += Math.floor(endHours / 24);
    endHours = endHours % 24;
  }

  // Handle day overflow (simplified - assumes max 31 days per month)
  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  if (endDay > daysInMonth) {
    endMonth += Math.floor((endDay - 1) / daysInMonth);
    endDay = ((endDay - 1) % daysInMonth) + 1;
  }

  // Handle month overflow
  if (endMonth >= 12) {
    endYear += Math.floor(endMonth / 12);
    endMonth = endMonth % 12;
  }

  return {
    startDateTime: formatDateTime(currentYear, month, day, hours, minutes),
    endDateTime: formatDateTime(endYear, endMonth, endDay, endHours, endMinutes),
  };
}

module.exports = {
  getCalendarClient,
  scheduleMeeting,
  formatAppointmentDateTime,
};

