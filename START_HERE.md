# Start here (developer handoff)

This zip is the Retention app rebranded for **The Apax Group**, with demo data for their client **Dorsey & Whitney**. It is the October 3 results dashboard with its own database built in: React front end, Express API and database, deployed as one Vercel project. Screens and scoring are unchanged; see `CHANGES.md` ("Apax edition") for what changed.

## The database is included
- `database/apax-starter.db` is the database that ships with the app. It already contains every table and the test login below.
- The first time the app starts, it copies that file to `data/apax.db` and works on the copy. Nothing to install, create or migrate.
- It is a standard SQLite file; any SQLite viewer (for example DB Browser for SQLite) can open it.
- Start over at any time with `npm run db:reset`.

## Logins (both are administrators with $1,000.00 of test credits)
- `shipmate2134@gmail.com` / `12345678`
- `todd@apax-us.com` / `12345678`
- Signing in opens the Home page for everyone. Change these short test passwords (Account, top right) before the app is shared beyond the demo.

## 1. Run it on your computer (2 minutes)
Needs Node.js 22.13 or newer (the current LTS is fine).
```
npm install
npm run dev
```
Open http://localhost:5173 and sign in with the test login.

## 2. Dorsey demo (what to run for the walkthrough)
1. As admin, open *Admin > Clients & users* and add a client (organization "Dorsey & Whitney LLP") with at least $500 in credits.
2. Edit that client and set the job site to Dorsey's Minneapolis office: label `Dorsey & Whitney, Minneapolis`, latitude `44.9777`, longitude `-93.2716`.
3. Sign in as the client. Upload `samples/Dorsey - Current Staff Demo.xlsx` under **Current staff** first (150 people scored; its 30 recent leavers build the turnover table by position).
4. Then upload `samples/Dorsey - Pre-hire Demo.xlsx` under **Pre-hire** (40 candidates, laid out exactly like Dorsey's positions file).

Both files are fictional people on Dorsey's real position titles. The CSV copies in `samples/` hold the same data. Regenerate them with `node scripts/make-samples.js`.

## 3. Deploy to Vercel
1. Push this folder to a new private GitHub repo and import it into Vercel. Vercel detects Vite; no build settings to change.
2. **Add a permanent database (one click, free tier). Required, do not skip.** In the Vercel project: *Storage > Create Database > Neon (Postgres) > Connect*. Vercel sets `DATABASE_URL` for you. On first start the app creates its tables and copies the test login in by itself.
3. Deploy, then open `/api/health`. It should show `"ok": true` and `"kind": "postgres"`.
4. Sign in with the test login and change the password.

Why step 2: Vercel can run the app on several servers at once, and none of them has a permanent disk. Without a connected database each server keeps its own copy of the data, so a file uploaded on one server can be missing on the next request, and everything resets when Vercel restarts. Sign-ins now hold across servers either way, but uploads and results need the database. The on-screen notices are switched off for the demo, so check `/api/health` (`"kind": "postgres"`) or the Database line on the Admin page (it must not say "temporary").

## Demo presentation settings
- Prices, credits and the Invoices page are hidden from client screens, and the three notices at the top of the page (demo mode, short password, temporary database) are off. Admin pages still show the database status.
- To turn them back on, set `SHOW_PRICING=true` and/or `SHOW_NOTICES=true` in Vercel environment variables and redeploy.
- Credits are still checked behind the scenes, so each account needs enough credit to run a file (both logins have $1,000; the Dorsey staff file uses $442.50).

Recommended environment variable: `APP_URL` (the public address, used in password-reset emails). Branding can be overridden with the `VITE_BRAND_*` and `BRAND_NAME` variables in `.env.example`; the defaults are already The Apax Group.

## 4. Test checklist
1. Run the Dorsey demo above.
2. Upload the staff file again and confirm the monthly-limit message.
3. Download the Excel report from a finished run.

Without `PDL_API_KEY` and `RAPIDAPI_KEY` the app runs in clearly labeled demo mode (simulated social signals). Do not add live keys or real client data until Roosevelt confirms.

## Security, before going live
- Rotate every key from the old `backendtwo` code: MongoDB user, Cloudinary, Gmail app password, RapidAPI, both People Data Labs keys, Social Searcher, Stripe, Airtable, JWT secret. The old code published them.
- Change the test password.
- `data/` is in `.gitignore` so a local database with uploads is never committed.

## Read next
- `README.md`: full setup, how scoring works, compliance notes
- `CHANGES.md`: everything fixed or changed
- Tests: `npm test` (runs on the built-in database; add `TEST_DATABASE_URL=postgres://...` to run the same tests on Postgres)
