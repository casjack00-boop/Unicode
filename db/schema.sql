-- UniMarket database schema
-- Rebuilds every table. Safe to run more than once.

-- Students
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    housing       TEXT CHECK (housing IN ('on_campus', 'off_campus')),
    verified      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emailed sign-up codes (stored hashed, expire, limited attempts)
CREATE TABLE IF NOT EXISTS verification_codes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Items for sale
CREATE TABLE IF NOT EXISTS listings (
    id           SERIAL PRIMARY KEY,
    seller_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
    category     TEXT NOT NULL CHECK (category IN ('textbooks', 'furniture', 'dorm', 'electronics', 'clothing', 'other')),
    condition    TEXT NOT NULL CHECK (condition IN ('new', 'like_new', 'good', 'fair')),
    meeting_spot TEXT,
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'removed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Up to 3 photos per listing (files stored elsewhere; this saves their location)
CREATE TABLE IF NOT EXISTS listing_photos (
    id          SERIAL PRIMARY KEY,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
    UNIQUE (listing_id, position)
);