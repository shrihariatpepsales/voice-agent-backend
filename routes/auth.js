const express = require('express');
const bcrypt = require('bcryptjs');
const { connectToDatabase } = require('../db');
const User = require('../models/User');
const Session = require('../models/Session');
const { updateAdminTokens } = require('../services/adminService');

const router = express.Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Redirect URI - must match exactly what's configured in Google Cloud Console
// For development: http://localhost:3001/auth/google/callback (backend port)
// For production: Set GOOGLE_REDIRECT_URI environment variable (e.g., https://yourdomain.com/auth/google/callback)
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  (process.env.NODE_ENV === 'production'
    ? 'https://yourdomain.com/auth/google/callback'
    : 'http://localhost:3001/auth/google/callback');

// Request both calendar and userinfo scopes
// userinfo scope is needed to fetch user email and name
const GOOGLE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

// POST /api/auth/signup
// Body: { email?, phone?, name?, password, browser_session_id? }
router.post('/signup', async (req, res) => {
  try {
    const { email, phone, name, password, browser_session_id: browserSessionId } = req.body || {};

    if (!email && !phone) {
      return res.status(400).json({ error: 'Either email or phone is required' });
    }
    if (email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }
    if (phone) {
      const phonePattern = /^\+?[0-9]{7,15}$/;
      if (!phonePattern.test(phone)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    await connectToDatabase();

    const query = {};
    if (email) {
      query.email = email.toLowerCase();
    } else if (phone) {
      query.phone = phone;
    }

    const existing = await User.findOne(query);
    if (existing) {
      return res.status(409).json({ error: 'User already exists with given email or phone' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      ...query,
      name: name || undefined,
      passwordHash,
    });

    if (browserSessionId) {
      await connectToDatabase();
      await Session.findOneAndUpdate(
        { browserSessionId, user: user._id },
        { $set: { browserSessionId, user: user._id } },
        { upsert: true, new: true }
      );
    }

    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email || null,
        phone: user.phone || null,
        name: user.name || null,
      },
      browser_session_id: browserSessionId || null,
    });
  } catch (err) {
    console.error('[auth] signup error', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
// Body: { email?, phone?, password, browser_session_id? }
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password, browser_session_id: browserSessionId } = req.body || {};

    if (!email && !phone) {
      return res.status(400).json({ error: 'Either email or phone is required' });
    }
    if (email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }
    if (phone) {
      const phonePattern = /^\+?[0-9]{7,15}$/;
      if (!phonePattern.test(phone)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    await connectToDatabase();

    const query = {};
    if (email) {
      query.email = email.toLowerCase();
    } else if (phone) {
      query.phone = phone;
    }

    const user = await User.findOne(query);
    if (!user) {
      // Do not reveal whether user exists
      return res.status(401).json({ error: 'Invalid email/phone or password' });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email/phone or password' });
    }

    if (browserSessionId) {
      await Session.findOneAndUpdate(
        { browserSessionId, user: user._id },
        { $set: { browserSessionId, user: user._id } },
        { upsert: true, new: true }
      );
    }

    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email || null,
        phone: user.phone || null,
        name: user.name || null,
      },
      browser_session_id: browserSessionId || null,
    });
  } catch (err) {
    console.error('[auth] login error', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// GET /auth/google
// Initiates Google OAuth 2.0 flow by redirecting to Google's consent screen
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    console.error('[auth] GOOGLE_CLIENT_ID is not set in environment variables');
    return res.status(500).json({ error: 'Google OAuth is not configured' });
  }

  // Build Google OAuth authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPE);
  authUrl.searchParams.set('access_type', 'offline'); // Required to get refresh_token
  authUrl.searchParams.set('prompt', 'consent'); // Force consent screen to get refresh_token

  // Redirect user to Google's OAuth consent screen
  res.redirect(authUrl.toString());
});

// GET /auth/google/callback
// Handles the callback from Google OAuth with authorization code
// Stores OAuth tokens in the singleton Admin record
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    // Handle OAuth errors from Google
    if (error) {
      console.error('[auth] Google OAuth error:', error);
      return res.redirect('/login?error=oauth_failed');
    }

    if (!code) {
      return res.redirect('/login?error=no_code');
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('[auth] Google OAuth credentials are not configured');
      return res.redirect('/login?error=config_error');
    }

    // Exchange authorization code for access token and refresh token
    console.log('[auth] Exchanging authorization code for tokens...', {
      redirect_uri: GOOGLE_REDIRECT_URI,
      client_id: GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.substring(0, 20)}...` : 'missing',
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[auth] Failed to exchange code for tokens:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
      });
      return res.redirect('/login?error=token_exchange_failed');
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope, token_type } = tokenData;

    console.log('[auth] Token exchange successful:', {
      has_access_token: !!access_token,
      has_refresh_token: !!refresh_token,
      expires_in,
      scope,
      token_type,
    });

    if (!access_token) {
      console.error('[auth] No access_token received from Google');
      return res.redirect('/login?error=no_access_token');
    }

    // Fetch admin info from Google using access token
    // Try v2 endpoint first, fallback to v3 if needed
    let userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });

    let endpointUsed = 'v2';

    // If v2 fails, try v3 as fallback
    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      const errorStatus = userInfoResponse.status;
      console.error('[auth] Failed to fetch user info from Google (v2):', {
        status: errorStatus,
        statusText: userInfoResponse.statusText,
        error: errorText,
        access_token_preview: access_token ? `${access_token.substring(0, 20)}...` : 'missing',
      });
      
      // Try alternative endpoint (v3) as fallback
      console.log('[auth] Attempting fallback to v3 userinfo endpoint...');
      userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/json',
        },
      });

      if (!userInfoResponse.ok) {
        const errorTextV3 = await userInfoResponse.text();
        console.error('[auth] Fallback v3 endpoint also failed:', {
          status: userInfoResponse.status,
          statusText: userInfoResponse.statusText,
          error: errorTextV3,
        });
        return res.redirect('/login?error=user_info_failed');
      }

      endpointUsed = 'v3';
    }

    const userInfo = await userInfoResponse.json();
    const { email, name } = userInfo;

    console.log('[auth] User info fetched successfully:', {
      endpoint: endpointUsed,
      email: email || 'missing',
      name: name || 'missing',
    });

    if (!email) {
      console.error(`[auth] No email received from Google user info (${endpointUsed})`);
      return res.redirect('/login?error=no_email');
    }

    // Calculate token expiry time
    const tokenExpiry = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    // Store or update admin with OAuth tokens (singleton pattern)
    // This will always update the single admin record or create it if it doesn't exist
    await updateAdminTokens({
      email,
      name,
      access_token,
      refresh_token,
      token_expiry: tokenExpiry,
    });

    // Log successful OAuth completion
    console.log(`[auth] Google OAuth tokens stored for admin: ${email} (via ${endpointUsed} endpoint)`);
    console.log(`[auth] Tokens stored: access_token=${!!access_token}, refresh_token=${!!refresh_token}`);

    // Redirect to frontend root
    res.redirect('/');
  } catch (err) {
    console.error('[auth] Google OAuth callback error:', err);
    return res.redirect('/login?error=server_error');
  }
});

module.exports = router;


