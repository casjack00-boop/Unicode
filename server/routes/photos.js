/**
 * =====================================================================
 *  server/routes/photos.js  --  Dev 4: Photo uploads
 * =====================================================================
 *
 * ROUTES (all relative to where this router is mounted, /api/listings):
 *   POST /api/listings/:id/photos          Seller uploads 1-3 photos to THEIR listing
 *   GET  /api/listings/:id/photos          Anyone reads a listing's photos -> { photos: [{ id, url }] }
 *   GET  /api/listings/photo-files/:name   Serves one saved image file
 *
 * HOW IT WORKS
 *   1. Seller picks photos on the Post page; the page sends them as form data.
 *   2. We check they're logged in and own the listing (before touching the files).
 *   3. multer saves each image in /uploads with a RANDOM name (the uploaded
 *      filename is never used).
 *   4. We re-check the real file contents, then store each photo's URL in the
 *      listing_photos table.
 *   5. Item Details / Browse read those URLs back and show the images.
 *
 * SECURITY RULES (from the task)
 *   - Only the logged-in seller who owns the listing can add photos.
 *   - JPG, PNG, WEBP only.  5 MB max per file.  Max 3 photos per listing.
 *   - Uploaded filenames are never used.
 *
 * ---------------------------------------------------------------------
 *  FOR CASSIDY (shared files this needs; Dev 4 has no shared-file edits otherwise)
 * ---------------------------------------------------------------------
 *   1. Run:  npm install multer      (changes package.json + package-lock.json)
 *   2. Add this line to .gitignore:  uploads/
 *   3. In the server file where the listings router is mounted
 *      (e.g. server/index.js), mount this router on the SAME path:
 *          app.use('/api/listings', require('./routes/photos'));
 *      This router only has paths like /:id/photos and /photo-files/:name,
 *      so it won't clash with the /:id route in listings.js.
 *
 *  Search this file for "(FILL-IN" to find the 6 spots that depend on how the
 *  rest of the project is written. They're all in the FILL-IN ZONE below.
 * =====================================================================
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const requireUser = require('../requireUser');

const router = express.Router();


/* =====================================================================
 *  FILL-IN ZONE  --  the only part that depends on the rest of the project
 * ===================================================================== */

/**
 * (FILL-IN 1: DATABASE CONNECTION)
 * Point this at the file that exports the PostgreSQL connection (the pg Pool),
 * the same one server/routes/listings.js uses. The code below calls
 * db.query('... $1 ...', [value]) and reads result.rows.
 * If listings.js imports it differently (e.g. `const { pool } = require(...)`),
 * copy that exact line here and name the result `db`.
 */
const db = require('../db');

/**
 * (FILL-IN 2: LOGGED-IN USER)
 * Return the logged-in student's id, or null/undefined if not logged in.
 * It must be the same kind of id stored as the listing's seller (FILL-IN 3).
 * Copy how the existing routes (e.g. POST /api/listings) read the login cookie:
 *   session-based:  return req.session && req.session.userId;
 *   middleware that sets req.user:  return req.user && req.user.id;
 */
function getLoggedInUserId(req) {
  // requireUser (our login check) runs first and sets req.user
  return req.user && req.user.id;
}

/**
 * (FILL-IN 3: FIND A LISTING AND ITS SELLER)
 * Return { id, ownerId } for the listing, or null if it doesn't exist.
 * Needs the real column that holds the seller's user id (schema file), e.g.:
 *
 *   const result = await db.query('SELECT id, seller_id FROM listings WHERE id = $1', [listingId]);
 *   const row = result.rows[0];
 *   return row ? { id: row.id, ownerId: row.seller_id } : null;
 */
async function findListing(listingId) {
  const result = await db.query('SELECT id, seller_id FROM listings WHERE id = $1', [listingId]);
  const row = result.rows[0];
  return row ? { id: row.id, ownerId: row.seller_id } : null;
}

/**
 * (FILL-IN 4: COUNT EXISTING PHOTOS)
 * Return how many photos this listing already has, as a JS number.
 * Needs the listing_photos column that points to the listing, e.g.:
 *
 *   const result = await db.query(
 *     'SELECT COUNT(*)::int AS count FROM listing_photos WHERE listing_id = $1', [listingId]);
 *   return result.rows[0].count;
 */
async function countPhotos(listingId) {
  const result = await db.query(
    'SELECT COUNT(*)::int AS count FROM listing_photos WHERE listing_id = $1', [listingId]);
  return result.rows[0].count;
}

/**
 * (FILL-IN 5: SAVE ONE PHOTO)
 * Insert a row into listing_photos and return the new row's id.
 *   photoUrl = the path to store, like "/api/listings/photo-files/3f2a...c1.jpg"
 *              (the browser uses it directly as <img src>)
 * Needs the listing_photos column names for the listing link and the photo path.
 * If the table has other required columns (position, created_at...), set them here.
 *
 *   const result = await db.query(
 *     'INSERT INTO listing_photos (listing_id, file_path) VALUES ($1, $2) RETURNING id',
 *     [listingId, photoUrl]);
 *   return result.rows[0].id;
 */
async function savePhoto(listingId, photoUrl, position) {
  // position is 1, 2, or 3 (the table requires it)
  const result = await db.query(
    'INSERT INTO listing_photos (listing_id, url, position) VALUES ($1, $2, $3) RETURNING id',
    [listingId, photoUrl, position]);
  return result.rows[0].id;
}

/**
 * (FILL-IN 6: READ A LISTING'S PHOTOS)
 * Return ALL photos for the listing as [{ id, url }], oldest first.
 * ORDER MATTERS: the first one is the "main" photo shown on Browse cards.
 *
 *   const result = await db.query(
 *     'SELECT id, file_path AS url FROM listing_photos WHERE listing_id = $1 ORDER BY id',
 *     [listingId]);
 *   return result.rows;
 */
async function getPhotos(listingId) {
  const result = await db.query(
    'SELECT id, url FROM listing_photos WHERE listing_id = $1 ORDER BY position',
    [listingId]);
  return result.rows;
}

/* =====================  END OF FILL-IN ZONE  ======================== */


/* ---------------------------------------------------------------------
 *  SETTINGS (match the task rules)
 * ------------------------------------------------------------------- */

// Saved images go in <project root>/uploads (this file is in server/routes/).
// The folder is created automatically if missing.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// URL the browser uses to load a saved image (served by the last route below).
const PHOTO_URL_PREFIX = '/api/listings/photo-files';

const MAX_PHOTOS_PER_LISTING = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowed types: browser-reported MIME type -> the extension WE choose.
// Since we pick the extension, the user's filename is never trusted or used.
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// A saved filename is always: random UUID + one of our three extensions.
const SAFE_FILENAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });


/* ---------------------------------------------------------------------
 *  MULTER (the library that receives file uploads)
 * ------------------------------------------------------------------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // Random name + our own extension, e.g. "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.jpg".
  // file.originalname is deliberately never used.
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + ALLOWED_TYPES[file.mimetype]);
  },
});

const receivePhotos = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,  // any file over 5 MB is rejected
    files: MAX_PHOTOS_PER_LISTING,  // more than 3 files in one request is rejected
  },
  // First check on type (trusts the browser's report; real contents are checked later).
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('INVALID_TYPE'));
  },
}).array('photos', MAX_PHOTOS_PER_LISTING); // form field name must be "photos"


/* ---------------------------------------------------------------------
 *  HELPERS
 * ------------------------------------------------------------------- */

/**
 * Second check on type. The browser's reported type can be faked, so read the
 * file's first bytes, which reveal the real format:
 *   JPEG: FF D8 FF      PNG: 89 50 4E 47 0D 0A 1A 0A      WEBP: "RIFF" ... "WEBP" at byte 8
 */
async function hasValidImageContents(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, 12, 0);

    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp =
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP';

    return isJpeg || isPng || isWebp;
  } finally {
    await handle.close();
  }
}

/** Delete just-uploaded files from disk (used when a request gets rejected). */
function deleteFiles(files = []) {
  files.forEach((f) => fs.unlink(f.path, () => {}));
}


/* ---------------------------------------------------------------------
 *  CHECKS THAT RUN BEFORE THE UPLOAD
 *  Order: logged in -> owns listing -> room left. A rejected request
 *  never writes a file to disk.
 * ------------------------------------------------------------------- */

function requireLogin(req, res, next) {
  const userId = getLoggedInUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  req.userId = userId;
  next();
}

async function requireListingOwner(req, res, next) {
  try {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId)) {
      return res.status(400).json({ error: 'Invalid listing id.' });
    }

    const listing = await findListing(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    // String() on both sides so 5 and "5" count as equal.
    if (String(listing.ownerId) !== String(req.userId)) {
      return res.status(403).json({ error: 'You can only add photos to your own listings.' });
    }

    req.listing = listing;
    next();
  } catch (err) {
    console.error('Ownership check failed:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}

async function requireRoomForPhotos(req, res, next) {
  try {
    const existing = await countPhotos(req.listing.id);
    if (existing >= MAX_PHOTOS_PER_LISTING) {
      return res
        .status(400)
        .json({ error: `This listing already has ${MAX_PHOTOS_PER_LISTING} photos.` });
    }
    req.existingPhotoCount = existing;
    next();
  } catch (err) {
    console.error('Photo count failed:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}


/* ---------------------------------------------------------------------
 *  POST /api/listings/:id/photos   (upload)
 *  Body: multipart form data, file field(s) named "photos".
 *  Success: 201 { ok: true, photos: [{ id, url }] }
 *  Failure: 4xx/5xx { error: "message the page can show" }
 * ------------------------------------------------------------------- */
router.post(
  '/:id/photos',
  requireUser,
  requireLogin,
  requireListingOwner,
  requireRoomForPhotos,
  (req, res) => {
    // Run multer manually so its errors become friendly messages.
    receivePhotos(req, res, async (err) => {
      if (err) {
        // (multer removes any partial uploads itself when it errors)
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Each photo must be 5 MB or smaller.' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
          return res
            .status(400)
            .json({ error: `You can upload at most ${MAX_PHOTOS_PER_LISTING} photos.` });
        }
        if (err.message === 'INVALID_TYPE') {
          return res.status(400).json({ error: 'Only JPG, PNG, or WEBP images are allowed.' });
        }
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Upload failed.' });
      }

      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'No photos were uploaded.' });
      }

      try {
        // Cap check again, now counting THIS upload (2 existing + 2 new = 4 -> rejected).
        if (req.existingPhotoCount + files.length > MAX_PHOTOS_PER_LISTING) {
          deleteFiles(files);
          return res.status(400).json({
            error: `A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos (it already has ${req.existingPhotoCount}).`,
          });
        }

        // Confirm every file really is a JPG/PNG/WEBP.
        for (const file of files) {
          if (!(await hasValidImageContents(file.path))) {
            deleteFiles(files);
            return res.status(400).json({ error: 'Only JPG, PNG, or WEBP images are allowed.' });
          }
        }

        // All good: record each photo in the database.
        const saved = [];
        let position = req.existingPhotoCount;
        for (const file of files) {
          const photoUrl = `${PHOTO_URL_PREFIX}/${file.filename}`;
          position += 1;
          const id = await savePhoto(req.listing.id, photoUrl, position);
          saved.push({ id, url: photoUrl });
        }

        return res.status(201).json({ ok: true, photos: saved });
      } catch (dbErr) {
        console.error('Saving photos failed:', dbErr);
        deleteFiles(files); // don't leave orphaned files on disk
        return res.status(500).json({ error: 'Could not save photos.' });
      }
    });
  }
);


/* ---------------------------------------------------------------------
 *  GET /api/listings/:id/photos   (read; public so anyone can browse)
 *  Success: 200 { photos: [{ id, url }] }   (empty array if none)
 * ------------------------------------------------------------------- */
router.get('/:id/photos', async (req, res) => {
  try {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId)) {
      return res.status(400).json({ error: 'Invalid listing id.' });
    }
    const photos = await getPhotos(listingId);
    res.json({ photos });
  } catch (err) {
    console.error('Fetching photos failed:', err);
    res.status(500).json({ error: 'Could not load photos.' });
  }
});


/* ---------------------------------------------------------------------
 *  GET /api/listings/photo-files/:name   (serve one image)
 *  Only names that look exactly like our generated ones are allowed, so
 *  nobody can request other files on the server (e.g. "../.env").
 * ------------------------------------------------------------------- */
router.get('/photo-files/:name', (req, res) => {
  if (!SAFE_FILENAME.test(req.params.name)) {
    return res.status(404).json({ error: 'Photo not found.' });
  }
  res.sendFile(
    path.join(UPLOAD_DIR, req.params.name),
    {
      headers: {
        'X-Content-Type-Options': 'nosniff', // browser must treat it as an image, nothing else
        'Cache-Control': 'public, max-age=31536000, immutable', // random names never change
      },
    },
    (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Photo not found.' });
    }
  );
});

module.exports = router;
