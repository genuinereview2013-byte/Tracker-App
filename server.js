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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!DATABASE_URL) {
  console.error(
    '\nMissing DATABASE_URL environment variable.\n' +
    'This app requires a Postgres database — see README.md for a free Neon setup.\n' +
    'Once you have a connection string, set DATABASE_URL and restart.\n'
  );
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.warn(
    '\nWarning: ADMIN_PASSWORD is not set. Deleting or editing other people\'s\n' +
    'entries will be disabled until you set it — see README.md.\n'
  );
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

const MONTH_NAMES = { 10: 'October', 11: 'November' };

function slugify(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'anon';
}

// Parses a 'YYYY-MM-DD' string without any timezone shifting, and returns
// { valid, monthNum, monthName } or { valid: false }.
function parseDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { valid: false };
  const [y, m, d] = s.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  const isRealDate = check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  if (!isRealDate) return { valid: false };
  const monthName = MONTH_NAMES[m];
  if (!monthName) return { valid: false, reason: 'date must be in October or November' };
  return { valid: true, monthNum: m, monthName };
}

// ---------- database ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
});

function rowToEntry(row) {
  const d = row.entry_date;
  const dateStr = d instanceof Date
    ? d.toISOString().slice(0, 10)
    : String(d); // pg can return DATE columns as 'YYYY-MM-DD' strings already
  return {
    id: row.id,
    name: row.name,
    date: dateStr,
    month: row.month,
    counts: row.counts,
    total: row.total,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function getAllEntries() {
  const { rows } = await pool.query('SELECT * FROM entries ORDER BY entry_date DESC');
  return rows.map(rowToEntry);
}

async function upsertEntry(entry) {
  const { rows } = await pool.query(
    `INSERT INTO entries (id, name, entry_date, month, counts, total, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       entry_date = EXCLUDED.entry_date,
       month = EXCLUDED.month,
       counts = EXCLUDED.counts,
       total = EXCLUDED.total,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [entry.id, entry.name, entry.date, entry.month, JSON.stringify(entry.counts), entry.total, entry.updatedAt]
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

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin access is not configured on this server (ADMIN_PASSWORD not set).' });
  }
  const supplied = req.header('x-admin-password') || '';
  if (supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  next();
}

function parseEntryBody(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const counts = body.counts && typeof body.counts === 'object' ? body.counts : {};

  if (!name) return { error: 'name is required' };

  const parsedDate = parseDateString(date);
  if (!parsedDate.valid) {
    return { error: parsedDate.reason || 'date must be a valid date (YYYY-MM-DD)' };
  }

  const cleanCounts = {};
  let total = 0;
  for (const key of Object.keys(POINTS)) {
    const n = Math.max(0, parseInt(counts[key], 10) || 0);
    cleanCounts[key] = n;
    total += n * POINTS[key];
  }

  const id = `${slugify(name)}__${date}`;
  return {
    entry: {
      id,
      name,
      date,
      month: parsedDate.monthName,
      counts: cleanCounts,
      total,
      updatedAt: new Date().toISOString(),
    },
  };
}

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

app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/entries', async (req, res) => {
  const parsed = parseEntryBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const saved = await upsertEntry(parsed.entry);
    res.json(saved);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to save entry' });
  }
});

// Admin-only: edit any entry, including fixing its name/date (which changes
// its id) — regular players can only ever upsert their own id via POST
// above, so this is the only way to correct someone else's record.
app.put('/api/entries/:id', requireAdmin, async (req, res) => {
  const parsed = parseEntryBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    if (parsed.entry.id !== req.params.id) {
      await removeEntry(req.params.id);
    }
    const saved = await upsertEntry(parsed.entry);
    res.json(saved);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to update entry' });
  }
});

app.delete('/api/entries/:id', requireAdmin, async (req, res) => {
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
