// The Festive Balance Challenge — backend server
//
// Storage: Postgres only (Neon, Supabase, Render Postgres, or any Postgres
// you point it at). Requires the DATABASE_URL environment variable to be
// set — the server refuses to start without it, so data is never silently
// stored somewhere that won't survive a redeploy.
//
// Setup:
//   1. Create a Postgres database (see README.md for a free Neon walkthrough).
//   2. Run db/schema.sql against it once.
//   3. Set DATABASE_URL, then: npm install && npm start

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    '\nMissing DATABASE_URL environment variable.\n' +
    'This app requires a Postgres database — see README.md for a free Neon setup.\n' +
    'Once you have a connection string, set DATABASE_URL and restart.\n'
  );
  process.exit(1);
}

// Point values — keep this in sync with public/index.html's ACTIVITIES list.
const POINTS = {
  strength: 2,
  run: 2,
  walk: 1,
  veg: 1,
  sleep: 1,
  hydrate: 1,
  indulge: 1,
  rescue: 1,
  protein: 1,
};
const MONTHS = ['October', 'November'];

function slugify(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'anon';
}

// ---------- database ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
});

function rowToEntry(row) {
  return {
    id: row.id,
    name: row.name,
    month: row.month,
    week: row.week,
    counts: row.counts,
    total: row.total,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function getAllEntries() {
  const { rows } = await pool.query('SELECT * FROM entries ORDER BY updated_at DESC');
  return rows.map(rowToEntry);
}

async function upsertEntry(entry) {
  const { rows } = await pool.query(
    `INSERT INTO entries (id, name, month, week, counts, total, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       month = EXCLUDED.month,
       week = EXCLUDED.week,
       counts = EXCLUDED.counts,
       total = EXCLUDED.total,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [entry.id, entry.name, entry.month, entry.week, JSON.stringify(entry.counts), entry.total, entry.updatedAt]
  );
  return rowToEntry(rows[0]);
}

async function removeEntry(id) {
  const { rowCount } = await pool.query('DELETE FROM entries WHERE id = $1', [id]);
  return rowCount > 0;
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, storage: 'postgres', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, storage: 'postgres', error: e.message });
  }
});

app.get('/api/entries', async (req, res) => {
  try {
    res.json(await getAllEntries());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to load entries' });
  }
});

app.post('/api/entries', async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const month = body.month;
  const week = parseInt(body.week, 10);
  const counts = body.counts && typeof body.counts === 'object' ? body.counts : {};

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!MONTHS.includes(month)) return res.status(400).json({ error: 'month must be October or November' });
  if (!Number.isInteger(week) || week < 1 || week > 5) return res.status(400).json({ error: 'week must be an integer 1-5' });

  const cleanCounts = {};
  let total = 0;
  for (const key of Object.keys(POINTS)) {
    const n = Math.max(0, parseInt(counts[key], 10) || 0);
    cleanCounts[key] = n;
    total += n * POINTS[key];
  }

  const id = `${slugify(name)}__${month.toLowerCase()}__week${week}`;
  const entry = {
    id,
    name,
    month,
    week,
    counts: cleanCounts,
    total,
    updatedAt: new Date().toISOString(),
  };

  try {
    const saved = await upsertEntry(entry);
    res.json(saved);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to save entry' });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const removed = await removeEntry(req.params.id);
    if (!removed) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to delete entry' });
  }
});

// Anything else -> serve the app (simple SPA-style fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

pool.query('SELECT 1')
  .then(() => {
    app.listen(PORT, () => {
      console.log(`The Festive Balance Challenge server is running at http://localhost:${PORT}`);
      console.log('Storage backend: postgres');
    });
  })
  .catch((e) => {
    console.error('\nCould not connect to the database. Check DATABASE_URL and that db/schema.sql has been run.\n', e.message);
    process.exit(1);
  });
