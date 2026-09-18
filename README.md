# Runway

A tracker for off-campus job leads and hackathons — the thing a spreadsheet
was *supposed* to be, except it doesn't go stale because you forgot to open
the tab.

Built with Next.js (App Router, Server Actions), Drizzle ORM, Postgres,
Better Auth (Google sign-in) and Tailwind. Small-group multi-user: a fixed
allowlist of accounts, a shared pool of opportunities, and per-user status,
notes and follow-ups on each one.

## What it does

- One table for both companies and hackathons (`type` field), since they
  move through the same pipeline: **found → applied → OA / in progress →
  selected / rejected** (hackathons get **hackathon active** instead of OA).
- Opportunities are **shared** — anyone on the allowlist sees every company
  and hackathon that's been logged. Your **status, notes, referral contact,
  next action and follow-up date are yours alone**.
- Only the person who logged an opportunity can delete it, since deleting
  cascades into everyone's tracking rows.
- A calendar, an agenda of what's due today or overdue, and a stats view.
- An attention strip on the tracker: passed deadlines, and "applied" entries
  that haven't moved in 14 days (measured from *your* last update, not the
  shared record).
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
| `ALLOWED_EMAILS` | Comma-separated Google emails allowed to sign in. **Required** — the app refuses to boot without it. |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the deployed site (optional in dev) |

## 4. Create the database tables

```bash
npm run db:push
```

This reads `src/db/schema.ts` and syncs the tables directly. Re-run it
whenever the schema changes. (`drizzle-kit push` may ask a yes/no question
when creating enum types — run it in a real terminal, not a piped one.)

## 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with an
allowlisted Google account.

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
    schema.ts             # opportunities, user_opportunity_tracking, opportunity_urls, auth tables
    index.ts              # Drizzle client
  lib/
    auth.ts               # Better Auth config + email allowlist
    validate.ts           # server-side input validation for the actions
    permissions.ts        # who can delete what
    dates.ts              # deadline math
    constants.ts          # status/type labels, colors, per-type status sets
```

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
