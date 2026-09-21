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

## 3. Run it locally

```bash
npm install
DATABASE_URL="postgresql://..." npm start
```

Open **http://localhost:3000**. If `DATABASE_URL` isn't set, the server logs
an error and exits immediately rather than starting in a broken state.

## 4. Deploy it — Render

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com) → **New +** → **Web Service** → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Go to the **Environment** tab → **Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: the connection string from step 1
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
- `POST /api/entries` — save/update one person's week (`{ name, month, week, counts }`); the server computes the point total itself
- `DELETE /api/entries/:id` — remove an entry
- `GET /api/health` — confirms the database connection is alive
- The frontend polls the server every 15 seconds so the leaderboard stays current for everyone with the page open

There's no login and no per-user auth — it's meant for a trusted team, the
same way a shared spreadsheet would be. Anyone with the link can log points
under any name.

## Backing up your data

Use Neon's dashboard to export your data, or run this in the SQL Editor and
download the results as CSV whenever you'd like a snapshot:
```sql
SELECT * FROM entries;
```
