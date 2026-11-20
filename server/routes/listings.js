
const express = require('express');
const pool = require('../db');

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

    res.json({ listing: result.rows[0] });
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

    if (!validCategories.includes(category) || !sortOptions[sort]) {
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

    if (search) {
      addCondition(
        `(l.title ILIKE '%' || ? || '%'
          OR COALESCE(l.description, '') ILIKE '%' || $${values.length + 1} || '%')`,
        search
      );
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
        l.course_number, l.edition, l.created_at,
        (
          SELECT lp.url
          FROM listing_photos lp
          WHERE lp.listing_id = l.id
          ORDER BY lp.position
          LIMIT 1
        ) AS photo_url
      FROM listings l
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortOptions[sort]}
      LIMIT 100
    `;

    const result = await pool.query(sql, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ error: 'Unable to load listings' });
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



module.exports = router;
