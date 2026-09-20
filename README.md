# Runway

A tracker for off-campus job leads and hackathons — the thing a spreadsheet
was *supposed* to be, except it doesn't go stale because you forgot to open
the tab.

Built with Next.js (App Router, Server Actions), Drizzle ORM, Postgres,
Better Auth (Google sign-in) and Tailwind. Multi-user, fully private: sign
in with Google and you get your own pipeline that nobody else can see.

## What it does

- One table for both companies and hackathons (`type` field), since they
  move through the same pipeline: **found → applied → OA / in progress →
  selected / rejected** (hackathons get **hackathon active** instead of OA).
- Everything you log is **private to your account** — other users never see
  your companies, deadlines or notes.
- A calendar, an agenda of what's due today or overdue, and a stats view.
- An attention strip on the tracker: passed deadlines, and "applied" entries
  that haven't moved in 14 days.
- Inline status changes, search, type/status filters, undoable delete,
  keyboard shortcuts (`n` to log, `/` to search), light/dark theme.

## 1. Get a free Postgres database

Any standard Postgres connection string works. The fastest free option:

1. Go to [neon.tech](https://neon.tech), sign up, create a project.
2. Copy the connection string it gives you (starts with `postgres://`).

Supabase or Railway work the same way if you'd rather use those.

## 2. Set up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   create an OAuth 2.0 client (Web application).
2. Add `http://localhost:3000/api/auth/callback/google` as an authorised
   redirect URI (and your production URL's equivalent later).
3. Note the client ID and secret.

## 3. Configure the environment

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Any long random string (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `http://localhost:3000` locally; your site URL in prod |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From step 2 |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the deployed site (optional in dev) |

## 4. Create the database tables

```bash
npm run db:push
```

This reads `src/db/schema.ts` and syncs the tables directly. Re-run it
whenever the schema changes. (`drizzle-kit push` may ask a yes/no question
when creating enum types — run it in a real terminal, not a piped one.)

**On a restricted network:** `drizzle-kit` connects over raw TCP on port
5432, which campus and office wifi often block. The app itself is fine —
it uses Neon's WebSocket driver on :443 — but `db:push` will time out. Use
a hotspot, Neon's web console, or hand-written SQL applied with:

```bash
npm run db:sql sql/001_inbox.sql   # goes over :443, runs in one transaction
```

Migrations in `sql/` are applied in filename order and are not tracked, so
only run one that hasn't been applied yet.

## 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

## Project structure

```
src/
  app/
    page.tsx              # session check, fetch + merge, renders the dashboard
    actions.ts            # server actions: create / update / delete
    api/auth/[...all]/    # Better Auth route handler
    layout.tsx
  components/
    Dashboard.tsx         # sidebar, filters, view state (mirrored to the URL)
    OpportunityTable.tsx
    AddEditPanel.tsx      # add/edit dialog
    CalendarView.tsx
    NotificationsView.tsx # "Agenda" — due today / overdue
    StatisticsView.tsx
    SettingsView.tsx
    DeadlineStamp.tsx     # deadline urgency badge
  db/
    schema.ts             # tracker + inbox tables, all scoped by user
    index.ts              # Drizzle client (Neon WebSocket transport)
  lib/
    auth.ts               # Better Auth config
    validate.ts           # server-side input validation for the actions
    dates.ts              # deadline math
    constants.ts          # status/type labels, colors, per-type status sets
```

## Search

The Inbox search box is hybrid: Postgres full-text over a generated tsvector
column, and pgvector cosine similarity over per-section embeddings, fused with
reciprocal rank fusion. Ranks are fused rather than scores, because a
`ts_rank` and a cosine distance are not on comparable scales.

Two details that matter more than the algorithm:

- **A distance cutoff.** Vector search returns its nearest neighbours however
  far away they are, so without one, "kubernetes" returns every posting in the
  inbox ranked by irrelevance. The threshold in `src/lib/inbox/search.ts` was
  measured against real postings and will need revisiting if the embedding
  model changes.
- **Boilerplate filtering.** Job boards surround a posting with nav bars and
  "similar jobs" rails, which survive HTML-to-text and then match job queries
  beautifully while being about a different job. `src/lib/inbox/chunk.ts`
  strips the common offenders; a real readability pass would do better.

Postings added before search existed have no index. The empty-results state
offers to backfill them.

## Checks

```bash
npm run lint       # eslint, flat config
npm run typecheck  # tsc --noEmit
npm test           # node:test over the pure logic — no network, no database
```

`npm test` bundles `tests/*.test.ts` with esbuild and runs Node's own test
runner. It covers the parts that are easy to break quietly: the extraction
validation rules, currency conversion, the match rubric's arithmetic, and the
date helpers. The rubric's one model-backed dimension is seeded with a cached
fit so nothing reaches the network.

## Deploying it

Push this to a GitHub repo, import it on [Vercel](https://vercel.com), and
add every variable from the table above as environment variables. Set
`BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` to your production URL and add
`<that URL>/api/auth/callback/google` to the Google OAuth client. Run
`npm run db:push` once against the production database.

## Where to take it next

- **Activity log** per opportunity (status change history) — would make the
  stats view far more useful than snapshot counts.
- **Deadline reminders** — a Vercel Cron job that emails or pings you about
  anything due in the next 48 hours.
- **CSV / JSON export** so your data isn't locked in.
- **Browser extension or bookmarklet** to add an entry straight from a job
  posting tab.
