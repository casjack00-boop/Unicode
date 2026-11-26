
const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const { normalizeISBN } = require('../isbn');

const router = express.Router();

const validCategories = [
  'all', 'textbooks', 'furniture', 'dorm',
  'electronics', 'clothing', 'other'
];

const sortOptions = {
  recommended: 'l.created_at DESC, l.id DESC',
  newest: 'l.created_at DESC, l.id DESC',
  price_asc: 'l.price_cents ASC, l.id DESC',
  price_desc: 'l.price_cents DESC, l.id DESC'
};

function parsePrice(value) {
  if (value === undefined || value === '') return null;

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return NaN;

  return Math.round(number * 100);
}

// Options for the textbook filter dropdowns
router.get('/filters', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ARRAY(
          SELECT DISTINCT department
          FROM listings
          WHERE category = 'textbooks'
            AND status = 'active'
            AND department IS NOT NULL
          ORDER BY department
        ) AS departments,
        ARRAY(
          SELECT DISTINCT course_number
          FROM listings
          WHERE category = 'textbooks'
            AND status = 'active'
            AND course_number IS NOT NULL
          ORDER BY course_number
        ) AS courses,
        ARRAY(
          SELECT DISTINCT edition
          FROM listings
          WHERE category = 'textbooks'
            AND status = 'active'
            AND edition IS NOT NULL
          ORDER BY edition
        ) AS editions
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Filter error:', error);
    res.status(500).json({ error: 'Unable to load filters' });
  }
});

// Search all active marketplace listings
router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 200);
    const category = String(req.query.category || 'all');
    const sort = String(req.query.sort || 'recommended');

    if (!validCategories.includes(category) || !Object.hasOwn(sortOptions, sort)) {
      return res.status(400).json({ error: 'Invalid filter or sort' });
    }

    const minPrice = parsePrice(req.query.minPrice);
    const maxPrice = parsePrice(req.query.maxPrice);

    if (Number.isNaN(minPrice) || Number.isNaN(maxPrice)) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      return res.status(400).json({ error: 'Minimum exceeds maximum' });
    }

    const conditions = ["l.status = 'active'"];
    const values = [];

    function addCondition(sql, value) {
      values.push(value);
      conditions.push(sql.replace('?', `$${values.length}`));
    }

    const searchISBN = search ? normalizeISBN(search) : null;
    let relevance = '';
    if (searchISBN) {
      addCondition('l.isbn = ?', searchISBN);
    } else if (search) {
      values.push(search.toLowerCase());
      const term = `$${values.length}`;
      const exact = `strpos(lower(concat_ws(' ', l.title, l.description, l.category,
        l.author, l.department, l.course_number, l.edition)), ${term}) > 0`;
      const fuzzy = `greatest(word_similarity(${term}, lower(l.title)),
        word_similarity(${term}, lower(coalesce(l.author, ''))))`;
      const allowFuzzy = search.length >= 4 && /[a-z]/i.test(search);
      conditions.push(allowFuzzy ? `(${exact} OR ${fuzzy} >= 0.45)` : `(${exact})`);
      if (sort === 'recommended') relevance = `CASE WHEN ${exact} THEN 0 ELSE 1 END, ${allowFuzzy ? fuzzy + ' DESC, ' : ''}`;
    }

    const condition = String(req.query.condition || '');
    if (condition) {
      if (!['new', 'like_new', 'good', 'fair'].includes(condition)) {
        return res.status(400).json({ error: 'Invalid condition' });
      }
      addCondition('l.condition = ?', condition);
    }

    const housing = String(req.query.housing || '');
    if (housing) {
      if (!['on_campus', 'off_campus'].includes(housing)) {
        return res.status(400).json({ error: 'Invalid housing filter' });
      }
      addCondition('EXISTS (SELECT 1 FROM users u WHERE u.id = l.seller_id AND u.housing = ?)', housing);
    }

    if (category !== 'all') {
      addCondition('l.category = ?', category);
    }

    if (minPrice !== null) {
      addCondition('l.price_cents >= ?', minPrice);
    }

    if (maxPrice !== null) {
      addCondition('l.price_cents <= ?', maxPrice);
    }

    if (category === 'textbooks') {
      for (const [field, column] of [
        ['department', 'department'],
        ['course', 'course_number'],
        ['edition', 'edition']
      ]) {
        const value = String(req.query[field] || '').trim();
        if (value) addCondition(`l.${column} = ?`, value);
      }
    }

    const sql = `
      SELECT
        l.id, l.title, l.description, l.price_cents,
        l.category, l.condition, l.department,
        l.course_number, l.edition, l.isbn, l.created_at,
        (SELECT u.housing FROM users u WHERE u.id = l.seller_id) AS seller_housing,
        (
          SELECT lp.url
          FROM listing_photos lp
          WHERE lp.listing_id = l.id
          ORDER BY lp.position
          LIMIT 1
        ) AS photo_url
      FROM listings l
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${relevance}${sortOptions[sort]}
      LIMIT 100
    `;

    const result = await pool.query(sql, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ error: 'Unable to load listings' });
  }
});



// My Listings: the logged-in student's own items (for my-listings.html)
// Must come BEFORE '/:id' or "mine" would be read as a listing id.
router.get('/mine', requireUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.price_cents, l.category, l.condition, l.status, l.created_at,
              (SELECT lp.url FROM listing_photos lp
                WHERE lp.listing_id = l.id ORDER BY lp.position LIMIT 1) AS photo_url
         FROM listings l
        WHERE l.seller_id = $1 AND l.status <> 'removed'
        ORDER BY l.created_at DESC, l.id DESC`,
      [req.user.id]
    );
    res.json({ listings: result.rows });
  } catch (error) {
    console.error('My listings error:', error);
    res.status(500).json({ error: 'Unable to load your listings.' });
  }
});

// Mark your own listing as sold (or bring it back) or remove it
const STATUS_CHANGES = ['active', 'sold', 'removed'];

router.patch('/:id/status', requireUser, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid listing ID' });
  }
  if (!STATUS_CHANGES.includes(status)) {
    return res.status(400).json({ error: 'Status must be active, sold, or removed.' });
  }

  try {
    // Only the seller can change it: the WHERE checks both the id and the owner
    const result = await pool.query(
      `UPDATE listings SET status = $1
        WHERE id = $2 AND seller_id = $3 AND status <> 'removed'
        RETURNING id, status`,
      [status, id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    res.json({ ok: true, listing: result.rows[0] });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Unable to update listing.' });
  }
});


// Get one listing for the Item Details page
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      error: 'Invalid listing ID'
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         l.*,
         u.display_name AS seller_name,
         u.housing AS seller_housing,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'url', lp.url,
                 'position', lp.position
               )
               ORDER BY lp.position
             )
             FROM listing_photos lp
             WHERE lp.listing_id = l.id
           ),
           '[]'::json
         ) AS photos
       FROM listings l
       JOIN users u ON u.id = l.seller_id
       WHERE l.id = $1
         AND l.status = 'active'`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: 'Listing not found'
      });
    }

    // Match the response format expected by public/item.js
    res.json({
      listing: result.rows[0]
    });

  } catch (error) {
    console.error('Item details error:', error);

    res.status(500).json({
      error: 'Unable to load listing'
    });
  }
});


// Post a new listing (must be logged in)
const CATEGORIES = ['textbooks', 'furniture', 'dorm', 'electronics', 'clothing', 'other'];
const CONDITIONS = ['new', 'like_new', 'good', 'fair'];

function cleanText(value, max) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

router.post('/', requireUser, async (req, res) => {
  const title = cleanText(req.body.title, 80);
  const description = cleanText(req.body.description, 1000);
  const meetingSpot = cleanText(req.body.meetingSpot, 120);
  const price = Number(req.body.price);
  const { category, condition } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required (80 characters max).' });
  }
  if (!Number.isFinite(price) || price < 0 || price > 10000) {
    return res.status(400).json({ error: 'Price must be between $0 and $10,000.' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Please pick a category.' });
  }
  if (!CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: 'Please pick a condition.' });
  }

  // Textbook details only matter for textbooks
  const isBook = category === 'textbooks';
  const rawISBN = req.body.isbn;
  let isbn = null;
  if (isBook && rawISBN !== undefined && rawISBN !== null) {
    if (typeof rawISBN !== 'string' || rawISBN.length > 40) {
      return res.status(400).json({ error: 'Enter a valid ISBN-10 or ISBN-13.' });
    }
    if (rawISBN.trim()) {
      isbn = normalizeISBN(rawISBN);
      if (!isbn) return res.status(400).json({ error: 'Enter a valid ISBN-10 or ISBN-13, or leave ISBN blank.' });
    }
  }

  try {
    const result = await pool.query(`
      INSERT INTO listings
        (seller_id, title, description, price_cents, category, condition, meeting_spot,
         department, course_number, edition, author, isbn)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      req.user.id, title, description, Math.round(price * 100), category, condition, meetingSpot,
      isBook ? cleanText(req.body.department, 20) : null,
      isBook ? cleanText(req.body.courseNumber, 20) : null,
      isBook ? cleanText(req.body.edition, 30) : null,
      isBook ? cleanText(req.body.author, 80) : null,
      isbn
    ]);
    res.status(201).json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Post listing error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});



module.exports = router;
