// Load secret settings from .env
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');

const app = express();

// Connection to PostgreSQL, using the address in .env
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// A test page: checks the database and counts students
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS students FROM users');
    res.json({
      status: 'ok',
      database: 'connected',
      students: Number(result.rows[0].students),
    });
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