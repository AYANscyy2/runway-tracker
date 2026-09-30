# Runway

A tracker for off-campus job leads and hackathons — the thing a spreadsheet
was *supposed* to be, except it doesn't go stale because you forgot to open
the tab.

Built with Next.js (App Router, Server Actions), Drizzle ORM, Postgres with
pgvector, Better Auth (Google sign-in), Tailwind, and Gemini via the Vercel
AI SDK for the Inbox. Multi-user, fully private: sign in with Google and you
get your own pipeline that nobody else can see.

## What it does

**Tracker**

- One table for both companies and hackathons (`type` field), since they
  move through the same pipeline: **found → applied → OA / in progress →
  selected / rejected** (hackathons get **hackathon active** instead of OA).
- Everything you log is **private to your account** — other users never see
  your companies, deadlines or notes.
- A calendar (click a day to log something due then), an agenda grouped
  into overdue / due today / next two weeks that includes follow-up dates,
  and a stats view.
- An attention strip on the tracker: passed deadlines, and "applied" entries
  that haven't moved in 14 days.
- Inline status changes, search, type/status filters, undoable delete,
  unsaved-changes guard on the form, light/dark theme, and a layout that
  works on a phone.
- Keyboard shortcuts: `n` to log, `/` to search, `1`–`6` to switch tabs,
  `Enter` / `e` to expand or edit the focused row, `Esc` to clear the search
  or close a dialog, `⌘/Ctrl + Enter` to save. The full list is under
  Settings.

**Inbox** — a staging area in front of the tracker

- Paste a job posting's or hackathon page's URL or its text (or type one in
  by hand). Runway fetches it, runs a Gemini extraction to pull out role,
  company, stack, pay, location, remote mode and deadline — or for a
  hackathon the event name, prize pool, format, dates, eligibility and
  themes — and validates the result before it's shown. LinkedIn search links
  are rewritten to the single job they point at; boards that block
  server-side fetches (Workday) get a clear "paste the text instead" rather
  than a hallucinated card.
- Fill in a **match profile** (your stack, target pay, locations, work
  setup, availability, and a sentence on what you want) and every posting
  gets a score out of 100. Stack overlap, pay, location and timing are
  computed arithmetically on every read, so they never go stale; only the
  "fit" dimension is asked of the model, and a card whose fit is pending
  says so and offers **Assess fit**. Hackathons use their own rubric: any
  overlap with the suggested tools counts, and prize and format replace pay
  and location. Foreign-currency pay is converted with a static table.
- **Track** promotes a posting into the tracker with its fields filled in
  (a hackathon becomes a hackathon entry); **Dismiss** records why.
  Re-adding something you dismissed or tracked says so instead of reviving
  it, and near-duplicates (same URL, or same role at the same company) are
  flagged with a one-click dismiss.
- Hybrid keyword + semantic search over everything in the inbox (see
  [Search](#search) below).
- Sits inside Google's free tier: flash-lite by default, one embedding call
  per posting, quota errors surface as a readable message instead of a
  stuck card.

## 1. Get a free Postgres database

Any standard Postgres connection string works, as long as the server has the
`vector` extension available (Neon, Supabase and Railway all ship it). The
fastest free option:

1. Go to [neon.tech](https://neon.tech), sign up, create a project.
2. Copy the connection string it gives you (starts with `postgres://`).

## 2. Set up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   create an OAuth 2.0 client (Web application).
2. Add `http://localhost:3000/api/auth/callback/google` as an authorised
   redirect URI (and your production URL's equivalent later).
3. Note the client ID and secret.

## 3. Get a Gemini key

The Inbox's extraction, scoring and search embeddings all go through Google
AI Studio. Create a key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) — the free
tier is enough for personal use. Skip this step if you only want the tracker;
the Inbox tab will just fail on ingest.

## 4. Configure the environment

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
| `GOOGLE_GENERATIVE_AI_API_KEY` | From step 3 |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.5-flash-lite`; bump to `gemini-3.5-flash` if extraction quality slips |
| `GEMINI_EMBED_MODEL` | Optional. Defaults to `gemini-embedding-001` (768 dims — the column width, don't change one without the other) |

## 5. Create the database tables

1. Enable the `vector` extension — `drizzle-kit` won't do it for you, and
   the schema needs it. In Neon's SQL editor (or `psql`):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. Sync every table from `src/db/schema.ts`:
   ```bash
   npm run db:push
   ```
   (`drizzle-kit push` may ask a yes/no question when creating enum types —
   run it in a real terminal, not a piped one.)
3. Add what Drizzle can't express — the generated tsvector column and the
   full-text and HNSW indexes on `job_chunks`:
   ```bash
   npm run db:sql sql/002_search.sql
   ```
   Every statement in it is guarded, so it's safe to run on a database
   `db:push` has already set up.

Re-run `npm run db:push` whenever the schema changes.

**On a restricted network:** `drizzle-kit` connects over raw TCP on port
5432, which campus and office wifi often block. The app itself is fine —
it uses Neon's WebSocket driver on :443 — but `db:push` will time out. Use
a hotspot or Neon's web console for the tracker and auth tables; the
Inbox's tables can be added over :443 with the hand-written migrations:

```bash
npm run db:sql sql/001_inbox.sql    # runs in one transaction
npm run db:sql sql/002_search.sql
npm run db:sql sql/003_inbox_kinds.sql   # hackathons, duplicates; guarded
npm run db:sql sql/004_tracker_fixes.sql # stale clock, undoable delete; guarded
```

`001_inbox.sql` is not guarded, so only run it on a database that doesn't
already have the inbox tables.

## 6. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.
Fill in your match profile under Settings before adding anything to the
Inbox, or every posting will score neutral.

## Project structure

```
src/
  app/
    page.tsx              # session check, fetch + merge, renders the dashboard
    actions.ts            # tracker server actions: create / update / delete
    inbox/actions.ts      # inbox server actions: ingest, retry, track, dismiss,
                          #   profile, search, backfill
    api/auth/[...all]/    # Better Auth route handler
    layout.tsx
  components/
    Dashboard.tsx         # sidebar, filters, view state (mirrored to the URL)
    OpportunityTable.tsx
    AddEditPanel.tsx      # add/edit dialog
    CalendarView.tsx
    NotificationsView.tsx # "Agenda" — overdue / today / next two weeks
    StatisticsView.tsx
    SettingsView.tsx      # theme, shortcuts, match profile, sign out
    InboxView.tsx         # paste box, posting cards, score breakdown, search
    ManualPostingForm.tsx # "Type it in" alternative to pasting
    ProfileForm.tsx       # the match profile
    DeadlineStamp.tsx     # deadline urgency badge
  db/
    schema.ts             # tracker + inbox tables, all scoped by user
    index.ts              # Drizzle client (Neon WebSocket transport)
  lib/
    auth.ts               # Better Auth config
    validate.ts           # server-side input validation for the actions
    dates.ts              # deadline math
    constants.ts          # status/type labels, colors, per-type status sets
    inbox/
      fetch-jd.ts         # URL → text, or a FetchBlockedError
      extract.ts          # Gemini structured extraction, with one retry
      schema.ts           # extraction schema + system prompt
      validate.ts         # rules an extraction must pass (sanity on pay, dates…)
      rubric.ts           # match scoring: weights, dimensions, reasons
      currency.ts         # static FX table and per-currency salary floors
      chunk.ts            # split a JD by section, drop board boilerplate
      embed.ts            # Gemini embeddings, 768 dims
      search.ts           # full-text + vector search, fused
      rrf.ts              # reciprocal rank fusion, pure
sql/                      # hand-written migrations, applied with db:sql
tests/                    # node:test over the pure logic
```

## How a posting moves through the Inbox

1. **Ingest.** A URL is fetched with a browser UA and stripped to text; a
   paste is used as-is. Content is hashed so re-adding the same posting
   reuses the row instead of duplicating it.
2. **Extract.** Gemini returns a structured object; `validate.ts` checks it
   (a "$9,000" annual salary is flagged as probably monthly, a deadline in
   the past is rejected, and so on). One failing rule triggers a single
   retry with the violation quoted back to the model. A posting stuck in
   `extracting` for three minutes is treated as failed and gets a Retry
   button — Retry never re-fetches the URL.
3. **Index.** The text is split along its own section headings and each
   section is embedded, so search can say *which part* matched.
4. **Score.** If you have a profile, the rubric produces a breakdown with a
   reason per dimension. Weights: stack 35, pay 25, fit 20, location 15,
   start date 5. Scores carry a rubric version so old ones stay readable
   when the weights change.
5. **Track or dismiss.** Tracking creates a tracker entry with role, stack,
   pay band, location and remote mode filled in and links back to the
   posting.

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
validation rules, currency conversion, the match rubric's arithmetic, the
chunker, rank fusion, and the date helpers. The rubric's one model-backed
dimension is seeded with a cached fit so nothing reaches the network.

## Deploying it

Push this to a GitHub repo, import it on [Vercel](https://vercel.com), and
add every variable from the table above as environment variables. Set
`BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` to your production URL and add
`<that URL>/api/auth/callback/google` to the Google OAuth client. Set up the
production database the same way as step 5.

## Where to take it next

- **Activity log** per opportunity (status change history) — would make the
  stats view far more useful than snapshot counts.
- **Deadline reminders** — a Vercel Cron job that emails or pings you about
  anything due in the next 48 hours.
- **CSV / JSON export** so your data isn't locked in.
- **Browser extension or bookmarklet** to send a posting to the Inbox
  straight from the job board tab.
- **A real readability pass** in the fetcher, so boilerplate filtering stops
  being a list of regexes.
