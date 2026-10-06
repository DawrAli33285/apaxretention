# What changed

## Demo refinements (October 6, 2026)
* Signing in opens the Home page for every account (administrators used to land on Admin).
* The Invoices button is hidden, and prices and credits are hidden from client screens: Home cards, upload preview, Start button, results list, results header and the pre-hire summary tile (now shows average cost per exit). Turn back on with `SHOW_PRICING=true`.
* The demo-mode, short-password and temporary-database notices are no longer shown at the top of every page (`SHOW_NOTICES=true` restores them). The Admin page still shows the database status.
* Second administrator login added to the starter database: todd@apax-us.com (same test password).
* Sign-in fixes: on Vercel without a connected database every server generated its own session key, so a sign-in on one server was rejected by the next and users bounced back to the login page. The key is now shared by all servers. The session cookie is now marked secure only on HTTPS requests, so `npm start` over plain HTTP no longer loops back to login.

## Apax edition (October 5, 2026)
Same layout and screens as the October 3 results dashboard, now with the database built in. Three things changed: the database, the branding and the demo data.

**Database built in**
* The September 29 built-in database is merged in: `database/apax-starter.db` ships with the app and holds the test login, so there is nothing to set up locally. On Vercel, connect Neon (Postgres) for permanent storage; see `START_HERE.md`.
* The October 3 results dashboard (outlook groups, drivers, six-step trail, person drop-down, Financial impact, How scores work) runs unchanged on it. `/api/jobs/:id/results` still returns the model point tables.


**Branding: The Apax Group**
* Colors from the Apax brand kit: #233dff (primary), #12229d (secondary), #050a30 (navy). Set once in `tailwind.config.js` (`brand` palette) and used everywhere.
* Fonts: Anton for the wordmark and page titles, Poppins for everything else. Self-hosted through `@fontsource` (no Google Fonts request).
* Apax mark redrawn as SVG in `src/components/Shell.jsx` (`ApaxMark`) and `public/favicon.svg`.
* Name, product and tagline: The Apax Group / Workforce Intelligence / "Understand People. Optimize Outcomes." Defaults in `src/lib/brand.js`, overridable with the `VITE_BRAND_*` variables. Server messages, invoice emails and the Excel report use `BRAND_NAME` (default The Apax Group).

**Demo data: Dorsey & Whitney**
* `samples/` now holds Dorsey demo files built on Dorsey's position list: Junior Associate (Corporate Law), Mid-Level Associate (M&A), Senior Associate (Business Litigation), Partner, Summer Associate/Intern., Paralegal, Legal Assistant, Information Services, Administrative. People are fictional, located around Minneapolis, with commute measured to 50 South Sixth Street. Regenerate with `node scripts/make-samples.js`.
* The pre-hire demo file uses Dorsey's exact column layout (sheet "Summary"), plus a "Distance (Miles)" column so commute scores without an address lookup.
* Financial impact uses law-firm replacement benchmarks by role (Partner $400K, Senior Associate $300K, Mid-Level $250K, Junior $200K, Summer $40K, Paralegal $45K, Legal Assistant $30K, Information Services $40K, Administrative $25K; other roles $22K to $30K). All are labelled benchmarks and editable on the Financial impact tab. Defined in `src/lib/financial.js`.
* Suggested next steps and demo-mode posts reworded for a law firm (billable hours, CLE, compensation and bonus instead of shifts).
* The test suite keeps its original fixed files in `tests/fixtures/`, so `npm test` is unchanged (36 of 36 pass).

## Results dashboard (October 3, 2026)
Results screen rebuilt for client presentations. Same flow, same brand, same data; clearer visuals and plain language.

**Three outlook groups up front**
* A single bar shows the split of At risk / Watch / Likely to stay. Click a color to jump to those people.
* Three large cards, one per group: the count, the share of people scored, what the group means, the cost if they leave, and the factor that hurts (or helps) that group most.
* A slim row underneath: people scored, average score, share with a stress signal, average cost per exit.

**Why the scores look the way they do**
* "What is driving the scores": average points each factor adds or takes away, for At risk, Watch or everyone, with a one-line takeaway.
* "Outlook by department / job class": stacked bars, highest share at risk first. Click a row to filter the list.

**How we got these numbers**
* Six clickable steps from the uploaded file to the score (rows in file, profile matches, posts read, stress signals, work data added, people scored), each with the real counts for this run and a plain explanation: rows set aside and why, match rate by network, data coverage per factor.

**Person drop-down**
* Score scale showing where the person lands, a plain-language summary of what pulls the score down and holds it up, a points bar for every factor with the data behind it, a suggested next step, where the data came from, stress level by area and the matched phrases.

**Financial impact and How scores work**
* Bigger headline figures, a breakdown of what one exit costs, and cost-at-risk bar charts by department and job class. Benchmark changes update every figure on the page.
* "How scores work" shows the score formula, the outlook scale, and each factor's point table as a chart. The tables are read from the scoring model (`/api/jobs/:id/results` now returns `model`), so the explanation always matches the math.

## Version 2.2 (September 29, 2026)
The app now comes with its own database. MongoDB is no longer used or needed.

* **Database included.** `database/apax-starter.db` ships in the zip with every table and the test login (`shipmate2134@gmail.com`, $1,000 test credits). The app copies it to `data/apax.db` on first start. It uses the SQLite engine built into Node.js, so there is nothing to install, no database server, and no native package to compile.
* **Postgres for hosting.** Setting `DATABASE_URL` (or connecting Neon or Supabase in Vercel, which sets it) switches to Postgres. Tables are created automatically and the starter login is copied in on first start. The same queries and the same tests run on both.
* **Clear status.** `/api/health` and *Admin > Overview* show which database is in use. On Vercel without a permanent database, administrators see a red *Temporary database* banner instead of losing data silently.
* **Short test password.** Signing in with a password under 10 characters works, and the app shows a reminder to change it until it is changed.
* Money is stored in whole cents and changed in one atomic statement; an upload and all of its rows are saved in one transaction (all or nothing).
* Expired results and old sign-in attempts are removed by an hourly cleanup (this replaced MongoDB's TTL indexes).
* New commands: `npm run db:reset` (start over from the starter database) and `npm run db:build-starter` (rebuild it with another login).
* Malformed request bodies now get a JSON error message instead of an HTML error page.
* Node.js 22.13 or newer is required (Node 20 reached end of life in April 2026).
* Removed: `mongoose`, `mongodb-memory-server-core`, `.localdb/`, `MONGODB_URI`. The legacy account import (`scripts/migrate-legacy.js`) still reads the old MongoDB but writes into the new database.


## Version 2.1 (September 29, 2026)
Fixes after review of the login screen and an independent code review.

**Sign-in and setup**
* The sign-in page showed "JWT_SECRET is not set" and "server not reachable" errors on any install without all four environment variables, and the warning flashed on every page load. Now no settings are required: the session key is generated and stored in the database, and the first visitor creates the administrator on a one-time setup form (optionally protected by `SETUP_TOKEN`).
* When the database is missing or unreachable, the sign-in page explains exactly what to fix instead of showing a login form that cannot work.
* The page no longer loads Google Fonts (a blocked request showed as a console error) and a signed-out visit no longer logs a 401.
* `npm run dev` works with no settings.

**Security**
* Sessions moved from localStorage tokens to httpOnly SameSite cookies, with an app header required on every write (cross-site request protection) and a logout endpoint.
* Changing or resetting a password, or disabling a user, ends their other sessions.
* Failed sign-ins are counted per account in the database, so the lockout holds across server instances; successful sign-ins no longer count toward the IP limit (an office behind one IP was locked out after 30 logins).
* First-run setup can no longer get stuck: inputs are validated before the one-time lock, and the lock is released if creating the admin fails.
* Password-reset links always use `APP_URL` in production, never the request's Host header.
* Content-Security-Policy and frame blocking headers added (`vercel.json`).

**Money and limits**
* Stopping a run could be repeated or run in parallel to refund the same records several times, minting credits. The refund now happens exactly once.
* Parallel uploads could all pass the one-run-per-month limit, and deleting a run gave the month back. Runs now take a numbered monthly slot through a unique database row; admins grant extra slots.
* Credits could drift (8.85 - 2.95 - 2.95 = 2.9499999...) and block a client who had enough balance. Balances now change by compare-and-set in whole cents.
* If starting a run fails after the charge (for example a database error), the charge is refunded and the month released.
* Stopping a run while it is processing can no longer be overwritten back to "completed", and a record that was refunded is never also scored.

**Robustness**
* Files are capped at 20,000 rows (a 3.6 MB file of junk rows used 900 MB of memory).
* Impossible ISO dates such as 2020-13-45 are rejected instead of rolled forward.
* Live enrichment respects the step deadline, so a slow provider cannot push a step past the function time limit.
* Indexes (including the unique ones the limits rely on) are built before the first request is served.
* The results page no longer runs two processing loops in development, retries a dropped connection, shows a live feed of people as they are scored, and uses in-app dialogs instead of browser pop-ups. A paused run offers "Stop and refund".

## Version 2.0
What changed from the old `backendtwo` + `public` code.

For the developer taking this over. The old code is not needed to run this version.

### Architecture
* One repo, one Vercel project. Express runs as `api/index.js`; the React app is built by Vite.
  Same origin, so no CORS and no hardcoded `BASE_URL`.
* Create React App (deprecated) replaced by Vite. Obfuscation step removed.
* Long synchronous `/api/enrich` request replaced by jobs processed in ~40 s steps.
  The old in-memory progress `Map` could not work on serverless (each request can hit a
  different instance) and a 1,000-row file would exceed any function time limit.
* All state in MongoDB. Cloudinary (public URLs to files full of PII) and Airtable removed.

### Security fixes
* Every secret moved to environment variables. **Rotate all old keys**: MongoDB user,
  Cloudinary, Gmail app password, RapidAPI, both PDL keys, Social Searcher, Stripe, Airtable, JWT.
* Passwords hashed with bcrypt (old: plain text for users and admins).
* Old `/resetPassword` and `/userresetPassword` let anyone set any account's password from
  its email address. Replaced with emailed one-time tokens (or admin reset).
* Old `/adminRegister` let anyone create an admin. Admins are now created by env bootstrap or by an admin.
* Old admin routes (`/getUsers`, `/deleteUser`, `/updateUser`, `/getFiles`, `/getAllInvoices`,
  `/dashboard/stats`, ...) had no authentication. All admin routes now require an admin JWT.
* Old `/register` accepted any fields, so a user could set their own `credits`.
* Old `/deductCredits` took the amount from the browser (a negative number added credits).
  Credits are now computed and deducted atomically on the server.
* Old `util/middleware` let requests through with no token, then crashed on `req.user._id`.
* JWT no longer embeds the full user document; user is reloaded on every request.
* Download passcodes were sent to the browser and checked client-side. Removed; exports require auth.
* ~330 real applicant emails and social profiles hardcoded in `scoringLogic.js`, and real
  Hancock files in `uploads/` and `public/assets/templates/`, are gone. Samples are fictional.
* CSV export escapes formulas; dependency audit is clean (`npm audit --omit=dev`).

### Scoring fixes
* Pre-hire Finance/Schedule/WLB/Family scores and distance were `randomBetween(1, 10)`.
  Removed. Missing data now scores 0 and is labelled.
* Two scoring engines disagreed (`scoringLogic.js` vs `routes/bulkUpload.js`): different age,
  tenure, distance and social tables, and opposite risk directions. Replaced by one model
  (`server/scoring/model.js`) that follows `Retention Calculation.xlsx`.
* Age/distance/tenure now use the spreadsheet's WOE method instead of a hardcoded
  "younger = more points" table. Age is off by default.
* Spreadsheet defects fixed: tenure lookup covered only the first 12 bands (0-36 months);
  the "feed to retention score" cells were hardcoded.
* PDL was disabled; the app only scored emails in the hardcoded list (after `slice(93)` dropped
  the first 93). Everyone else was silently skipped. Live PDL enrichment is back, with a
  minimum match likelihood so low-confidence matches are not scored (in the hardcoded list,
  79 of 176 matched profiles had confidence under 50, some pointing at differently named people).
* Keyword library: weights on three incompatible scales (1-5 risk, 1-10 positive, and an
  unrelated `final_score`, r = -0.06). Rebuilt with risk/protective polarity and 1-3 severity.
  "Communication" was stored under the key `family`; labels now match.
* `determineRiskLevel()` was called without `hasData`, so every row in the Excel output said "Low".
* RapidAPI 429 retries computed a wait time but never waited (5 instant retries).
* Frontend colours contradicted each other (score >= 7 was green in one column and "High Risk"
  red in another). Retention Delta was shown as a percentage; it is a points sum.
* Turnover was a fixed 9 or 6 points. It is now calculated per job class from leavers in the
  staff file (excluding temp-contract ends and transfers) and reused for pre-hire.

### Process rules added (Retention Process Flow Update 1-28-26)
* Current staff: 1 run per month, 1 run per contact per month, exact limit message.
* Pre-hire: duplicate candidates in a file merged and not charged.

### Removed or deferred
* Stripe card payments: the old flow marked invoices paid before payment and had no webhook.
  Replaced with admin invoices that add credits when marked paid. Stripe Checkout + webhook
  can be added later.
* SFTP intake for pre-hire (in the process doc) is not built; uploads are over HTTPS.
* Airtable sync (was already commented out).
