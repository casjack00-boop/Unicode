// Load secret settings from .env
require('dotenv').config();
const path = require('path');

const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db');
const authRoutes = require('./routes/auth');

const app = express();

// Let the server read JSON sent from the app
app.use(express.json());

// Let the server read cookies (the login ticket)
app.use(cookieParser());

// Sign-up and login routes live at /api/auth/...
app.use('/api/auth', authRoutes);

//Serve the app's pages (HTML, CSS, JavaScript) from the public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// Test page: checks the database and counts students
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS students FROM users');
    res.json({ status: 'ok', database: 'connected', students: Number(result.rows[0].students) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', database: 'not connected' });
  }
});

// Start listening for visitors
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`UniMarket server running at http://localhost:${port}`);
});