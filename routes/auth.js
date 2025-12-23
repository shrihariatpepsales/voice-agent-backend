const express = require('express');
const bcrypt = require('bcryptjs');
const { connectToDatabase } = require('../db');
const User = require('../models/User');
const Session = require('../models/Session');

const router = express.Router();

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

module.exports = router;


