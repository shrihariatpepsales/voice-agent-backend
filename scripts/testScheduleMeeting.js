/**
 * Test script for schedule-meeting endpoint
 * Run with: node scripts/testScheduleMeeting.js
 */

require('dotenv').config();

async function testScheduleMeeting() {
  const baseUrl = process.env.API_URL || 'http://localhost:3001';

  try {
    console.log('Testing POST /schedule-meeting endpoint...\n');
    console.log('Using defaults (24th December 2025, 12:00 PM IST, 30 minutes)...\n');

    const response = await fetch(`${baseUrl}/schedule-meeting`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Using defaults - can be omitted
        summary: 'Test Appointment',
        description: 'Booked via backend API using stored refresh token',
        startDateTime: '2025-12-24T12:00:00+05:30',
        endDateTime: '2025-12-24T12:30:00+05:30',
        timezone: 'Asia/Kolkata',
        calendarId: 'primary',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Request failed:');
      console.error(`Status: ${response.status}`);
      console.error(`Error: ${data.error || 'Unknown error'}`);
      process.exit(1);
    }

    console.log('✅ Meeting scheduled successfully!\n');
    console.log('Response:');
    console.log('─'.repeat(60));
    console.log(`Event ID:     ${data.eventId}`);
    console.log(`Summary:      ${data.summary}`);
    console.log(`Start:        ${data.start}`);
    console.log(`End:          ${data.end}`);
    console.log(`Meeting Link: ${data.meetingLink || 'N/A'}`);
    console.log(`Calendar Link: ${data.htmlLink || 'N/A'}`);
    console.log('─'.repeat(60));

    if (data.meetingLink) {
      console.log(`\n📹 Google Meet Link: ${data.meetingLink}`);
    }
  } catch (error) {
    console.error('❌ Error testing endpoint:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Make sure the backend server is running on', baseUrl);
    }
    process.exit(1);
  }
}

testScheduleMeeting();

