-- UniMarket sample data. Run in SQL Shell with:  \i 'path/to/db/seed.sql'
-- IMPORTANT: table and column names below are ASSUMED. Compare them with
-- db/schema.sql and rename anything that doesn't match.

-- ---------- Test students ----------
INSERT INTO users (display_name, email, housing, verified) VALUES
  ('Maya Johnson',  'mjohnson@patriots.uttyler.edu', 'on_campus',   TRUE),
  ('Carlos Rivera', 'crivera@patriots.uttyler.edu',  'on_campus',  TRUE),
  ('Aisha Patel',   'apatel@patriots.uttyler.edu',   'off_campus',        TRUE),
  ('Tyler Brooks',  'tbrooks@patriots.uttyler.edu',  'on_campus',   TRUE);

-- ---------- 10 listings (price_cents: 6000 = $60.00) ----------
-- seller_id is looked up by email so we never have to guess user ids.
INSERT INTO listings
  (seller_id, title, description, price_cents, category, condition, meeting_spot)
VALUES
  ((SELECT id FROM users WHERE email = 'mjohnson@patriots.uttyler.edu'),
   'Calculus: Early Transcendentals, 8th Ed.',
   'Used for one semester. Light highlighting in the first three chapters, no torn pages.',
   6000, 'textbooks', 'good', 'Robert R. Muntz Library, front entrance'),

  ((SELECT id FROM users WHERE email = 'crivera@patriots.uttyler.edu'),
   'Serta Office Chair',
   'Comfy for working those online classes. Perfect for a dorm. Must pick up, moving out soon.',
   10000, 'furniture', 'good', 'Cardinal Village parking lot'),

  ((SELECT id FROM users WHERE email = 'apatel@patriots.uttyler.edu'),
   'TI-84 Plus graphing calculator',
   'Works perfectly. Comes with a slide-on cover and fresh batteries.',
   5500, 'electronics', 'like_new', 'University Pond Plaza'),

  ((SELECT id FROM users WHERE email = 'tbrooks@patriots.uttyler.edu'),
   'Desk lamp with USB charging port',
   'Three brightness levels, bends to any angle. Great for late-night studying.',
   1800, 'furniture', 'like_new', 'Patriot Village main office'),

  ((SELECT id FROM users WHERE email = 'mjohnson@patriots.uttyler.edu'),
   'Fi-Fine microphone with desk arm',
   'Great condition, slightly used, great audio quality',
   7500, 'electronics', 'good', 'University Center entrance'),

  ((SELECT id FROM users WHERE email = 'crivera@patriots.uttyler.edu'),
   'Wireless Bluetooth headphones',
   'Over-ear, about 20 hours of battery. Small scuff on the left earcup, sound is perfect.',
   3500, 'electronics', 'fair', 'Robert R. Muntz Library, front entrance'),

  ((SELECT id FROM users WHERE email = 'apatel@patriots.uttyler.edu'),
   'Organic Chemistry textbook + study guide',
   'Both books together. Study guide has some pencil notes that can be erased.',
   8000, 'textbooks', 'good', 'Science Building lobby'),

  ((SELECT id FROM users WHERE email = 'tbrooks@patriots.uttyler.edu'),
   'Dell Laptop',
   'Used a lot but it''s all clear and ready, still works great',
   20000, 'electronics', 'fair', 'Patriot Village main office'),

  ((SELECT id FROM users WHERE email = 'mjohnson@patriots.uttyler.edu'),
   'Backpack with laptop sleeve',
   'Fits a 15-inch laptop. Zippers all work, one water bottle pocket.',
   2200, 'other', 'good', 'University Center entrance'),

  ((SELECT id FROM users WHERE email = 'apatel@patriots.uttyler.edu'),
   'Scrub top and pants set (Small)',
   'Navy blue, worn twice for clinicals. Washed and in great shape.',
   2000, 'clothing', 'like_new', 'Soules College of Business lobby');
