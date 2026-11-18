-- UniMarket sample data. Run in SQL Shell with:  \i 'path/to/db/seed.sql'
-- IMPORTANT: table and column names below are ASSUMED. Compare them with
-- db/schema.sql and rename anything that doesn't match.

-- ---------- Test students ----------
INSERT INTO users (name, email, housing, verified) VALUES
  ('Maya Johnson',  'mjohnson@patriots.uttyler.edu', 'Patriot Village',   TRUE),
  ('Carlos Rivera', 'crivera@patriots.uttyler.edu',  'Cardinal Village',  TRUE),
  ('Aisha Patel',   'apatel@patriots.uttyler.edu',   'Off campus',        TRUE),
  ('Tyler Brooks',  'tbrooks@patriots.uttyler.edu',  'Patriot Village',   TRUE);

-- ---------- 10 listings (price_cents: 6000 = $60.00) ----------
-- seller_id is looked up by email so we never have to guess user ids.
INSERT INTO listings
  (seller_id, title, description, price_cents, category, condition, meeting_spot)
VALUES
  ((SELECT id FROM users WHERE email = 'mjohnson@patriots.uttyler.edu'),
   'Calculus: Early Transcendentals, 8th Ed.',
   'Used for one semester. Light highlighting in the first three chapters, no torn pages.',
   6000, 'Textbooks', 'Good', 'Robert R. Muntz Library, front entrance'),

  ((SELECT id FROM users WHERE email = 'crivera@patriots.uttyler.edu'),
   'Serta Office Chair',
   'Comfy for working those online classes. Perfect for a dorm. Must pick up, moving out soon.',
   10000, 'Furniture', 'Decent', 'Cardinal Village parking lot'),

  ((SELECT id FROM users WHERE email = 'apatel@patriots.uttyler.edu'),
   'TI-84 Plus graphing calculator',
   'Works perfectly. Comes with a slide-on cover and fresh batteries.',
   5500, 'Electronics', 'Like New', 'University Pond Plaza'),

  ((SELECT id FROM users WHERE email = 'tbrooks@patriots.uttyler.edu'),
   'Desk lamp with USB charging port',
   'Three brightness levels, bends to any angle. Great for late-night studying.',
   1800, 'Furniture', 'Like New', 'Patriot Village main office'),

  ((SELECT id FROM users WHERE email = 'mjohnson@patriots.uttyler.edu'),
   'Fi-Fine microphone with desk arm',
   'Great condition, slightly used, great audio quality',
   7500, 'Electronics', 'Great', 'University Center entrance'),

  ((SELECT id FROM users WHERE email = 'crivera@patriots.uttyler.edu'),
   'Wireless Bluetooth headphones',
   'Over-ear, about 20 hours of battery. Small scuff on the left earcup, sound is perfect.',
   3500, 'Electronics', 'Fair', 'Robert R. Muntz Library, front entrance'),

  ((SELECT id FROM users WHERE email = 'apatel@patriots.uttyler.edu'),
   'Organic Chemistry textbook + study guide',
   'Both books together. Study guide has some pencil notes that can be erased.',
   8000, 'Textbooks', 'Good', 'Science Building lobby'),

  ((SELECT id FROM users WHERE email = 'tbrooks@patriots.uttyler.edu'),
   'Dell Laptop',
   'Used a lot but it''s all clear and ready, still works great',
   20000, 'Electronic', 'Fine', 'Patriot Village main office'),

  ((SELECT id FROM users WHERE email = 'mjohnson@patriots.uttyler.edu'),
   'Backpack with laptop sleeve',
   'Fits a 15-inch laptop. Zippers all work, one water bottle pocket.',
   2200, 'Other', 'Good', 'University Center entrance'),

  ((SELECT id FROM users WHERE email = 'apatel@patriots.uttyler.edu'),
   'Scrub top and pants set (Small)',
   'Navy blue, worn twice for clinicals. Washed and in great shape.',
   2000, 'Clothing', 'Like New', 'Soules College of Business lobby');
