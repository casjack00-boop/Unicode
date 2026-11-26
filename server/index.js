// Load secret settings from .env
require('dotenv').config();
const path = require('path');

const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const listingsRoutes = require('./routes/listings');
const photoRoutes = require('./routes/photos');
const ratingRoutes = require('./routes/ratings');
const profileRoutes = require('./routes/profiles');
const messageRoutes = require('./routes/messages');
const bookRoutes = require('./routes/books');
const roommateRoutes = require('./routes/roommates');

const app = express();

// Let the server read JSON sent from the app
app.use(express.json());

// Let the server read cookies (the login ticket)
app.use(cookieParser());

// Sign-up and login routes live at /api/auth/...
app.use('/api/auth', authRoutes);
// Photos go first so /api/listings/photo-files/... isn't mistaken for a listing id
app.use('/api/listings', photoRoutes);
app.use('/api/listings', listingsRoutes);
// Seller ratings
app.use('/api/sellers', ratingRoutes);

app.use('/api/profiles', profileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/roommates', roommateRoutes);
app.use('/api/discovery', require('./routes/discovery'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/safety', require('./routes/safety'));
app.use('/api/academic', require('./routes/academic'));
app.use('/api/reputation', require('./routes/reputation'));
 

// Serve the app's pages (HTML, CSS, JavaScript) from the public folder
app.use(express.static(path.join(__dirname, '..', 'public')));
// Serve the Quagga2 barcode recognition library
app.get('/vendor/quagga.min.js', (req, res) => {
  res.sendFile(path.join(
    __dirname,
    '..',
    'node_modules',
    '@ericblade',
    'quagga2',
    'dist',
    'quagga.min.js'
  ));
});

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
const { startReservationExpiry } = require('./reservation-expiry');
app.listen(port, () => {
  startReservationExpiry(pool);
  console.log(`UniMarket server running at http://localhost:${port}`);
});