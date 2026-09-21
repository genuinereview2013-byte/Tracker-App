# The Festive Balance Challenge — server

A small self-hosted app with a real backend: everyone who opens the page logs
points, and the leaderboard updates for the whole team automatically. No
Claude login, no browser-storage tricks — a Node server, backed by Postgres.

Storage is Postgres-only by design: the server refuses to start without a
`DATABASE_URL`, so there's no way to accidentally end up storing points
somewhere (like a container's local filesystem) that gets wiped on the next
redeploy.

## What's inside

```
server.js         Express server + REST API
public/index.html The tracker itself (frontend)
db/schema.sql      Run this once against your database
package.json
Dockerfile          For container-based hosting
```

## 1. Get a free Postgres database (Neon)

1. Go to **[neon.tech](https://neon.tech)** → sign up free (no card required).
2. Create a new project (any name, e.g. `festive-challenge`).
3. On the project dashboard, find **Connection string** (or "Connection
   Details") and copy it — it looks like:
   ```
   postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/dbname?sslmode=require
   ```

## 2. Create the table

Still on Neon, open the **SQL Editor** and paste in the contents of
`db/schema.sql` from this project, then run it. This creates the `entries`
table the app expects — you only need to do this once, ever.

## 3. Set an admin password (optional but recommended)

Anyone can log their own points, but deleting or editing *someone else's*
entry is restricted to a single admin password. Pick any password and set it
as `ADMIN_PASSWORD` alongside `DATABASE_URL` (see step 5 for how to set
environment variables on Render). Without it, the admin panel on the page
will simply reject every login attempt — nothing else is affected.

## 4. Run it locally

```bash
npm install
DATABASE_URL="postgresql://..." ADMIN_PASSWORD="pick-something" npm start
```

Open **http://localhost:3000**. If `DATABASE_URL` isn't set, the server logs
an error and exits immediately rather than starting in a broken state. If
`ADMIN_PASSWORD` isn't set, the app still runs fine — the admin panel just
won't accept a login until you add it.

## 5. Deploy it — Render

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com) → **New +** → **Web Service** → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Go to the **Environment** tab → **Add Environment Variable**, twice:
   - Key: `DATABASE_URL`, Value: the connection string from step 1
   - Key: `ADMIN_PASSWORD`, Value: whatever password you want to gate admin actions with
5. Deploy. Render gives you a public `https://your-app.onrender.com` URL.

Confirm it's wired up correctly by visiting
`https://<your-app>.onrender.com/api/health` — you should see:
```json
{"ok": true, "storage": "postgres", ...}
```
If that request fails instead, double-check `DATABASE_URL` is saved on the
correct service and includes the full string (including `?sslmode=require`).

From here, redeploying, restarting, or even deleting and recreating the
Render service won't touch your data — it all lives in Neon.

## Other deploy targets

The same `DATABASE_URL` approach works anywhere:

### Railway.app
Add the same `DATABASE_URL` variable under your service's **Variables** tab
(Railway also offers its own one-click Postgres if you'd rather not use Neon).

### Fly.io / any Docker host
```bash
docker build -t festive-challenge .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." festive-challenge
```

### A VPS you already have
```bash
git clone <your-repo>
cd festive-balance-challenge-server
npm install --production
DATABASE_URL="postgresql://..." npm start   # or set it in your process manager / systemd unit
```

## How it works

- `GET /api/entries` — returns every logged week
- `POST /api/entries` — save/update your own week (`{ name, month, week, counts }`); the server computes the point total itself. Anyone can call this for any name — it's how the shared board works, same as a shared spreadsheet.
- `PUT /api/entries/:id` — **admin only.** Edit any entry, including someone else's — also handles fixing a typo'd name (it migrates the entry to the corrected id).
- `DELETE /api/entries/:id` — **admin only.** Remove an entry.
- `GET /api/admin/verify` — checks an admin password without changing anything (used by the page's login form).
- `GET /api/health` — confirms the database connection is alive
- The frontend polls the server every 15 seconds so the leaderboard stays current for everyone with the page open

Logging your own points needs no login, same as a shared spreadsheet — anyone
with the link can add points under any name. Editing or deleting *someone
else's* entry requires the admin password, entered once in the "Admin"
section near the bottom of the page. One caveat worth knowing: the password
is checked by the server on every request, but it travels as a plain header
and is kept in the browser's `sessionStorage` for convenience — fine for
keeping honest teammates from bumping each other's scores by accident, not
meant to withstand a determined attacker. Don't reuse a password you care
about elsewhere.

## Backing up your data

Use Neon's dashboard to export your data, or run this in the SQL Editor and
download the results as CSV whenever you'd like a snapshot:
```sql
SELECT * FROM entries;
```
