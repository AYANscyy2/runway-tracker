# Runway

A tracker for off-campus job leads and hackathons — the thing a spreadsheet
was *supposed* to be, except it doesn't go stale because you forgot to open
the tab.

Built with Next.js (App Router, Server Actions), Drizzle ORM, Postgres, and
Tailwind. No auth, no multi-user — this is a single-player tool for your own
pipeline.

## What it does

- One table for both companies and hackathons (`type` field), since they
  move through the same pipeline: **found → applied → in progress →
  selected / rejected**.
- A "next 7 days" rail so deadlines don't quietly slide past you.
- Inline status changes — no save button, just pick a new status from the
  dropdown in the row.
- Filter by type and status, sorted by nearest deadline first.

## 1. Get a free Postgres database

Any standard Postgres connection string works. The fastest free option:

1. Go to [neon.tech](https://neon.tech), sign up, create a project.
2. Copy the connection string it gives you (starts with `postgres://`).

Supabase or Railway work the same way if you'd rather use those.

## 2. Set up the 

```bash
npm install
cp .env.example .env.local
# paste your connection string into .env.local
```

## 3. Create the database table

```bash
npm run db:push
```

This reads `src/db/schema.ts` and creates the `opportunities` table directly
— no migration files to manage, which is the right tradeoff for a personal
tool like this.

**If `db:push` hangs on "Pulling schema from database..."**: on a brand-new
database, `drizzle-kit push` needs to ask an interactive yes/no question to
confirm creating the new enum types, and that prompt doesn't render in every
terminal — it just looks frozen. Use the non-interactive path instead:

```bash
npm run db:generate   # writes SQL migration files to ./drizzle
npm run db:migrate    # applies them directly, no prompts
```

`db:migrate` is also safe to re-run — already-applied migrations are skipped.

## 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/
    page.tsx          # fetches data, renders the dashboard
    actions.ts         # server actions: create / update / delete
    layout.tsx
  components/
    Dashboard.tsx       # filters + layout glue
    OpportunityTable.tsx
    AddEditPanel.tsx     # the add/edit modal
    DeadlineStamp.tsx    # the deadline urgency badge
    StatsBar.tsx
    DeadlineRail.tsx
  db/
    schema.ts            # the single `opportunities` table
    index.ts              # Drizzle client
  lib/
    dates.ts               # deadline math
    constants.ts            # status/type labels and colors
```

## Deploying it

Push this to a GitHub repo, import it on [Vercel](https://vercel.com), add
`DATABASE_URL` as an environment variable in the project settings, and it's
live. Works well as a portfolio link since it's a real working app with a
real database, not a static mock.

## Where to take it next

A few obvious upgrades if you want to keep building on this rather than
calling it done:

- **Drag-and-drop Kanban view** grouped by status, instead of (or alongside)
  the table — better for a quick visual scan of where everything sits.
- **Deadline reminders** — a cron job (Vercel Cron works for free tiers)
  that emails or pings you about anything due in the next 48 hours.
- **Browser extension or bookmarklet** to add an entry straight from a job
  posting tab, instead of typing the name/link in by hand.
- **CSV export** for when you want the data outside the app (e.g. to share
  progress with a mentor).

Any one of these is a legitimate scoped feature to add and talk about in an
interview — "I built a tracker, then noticed X was annoying, so I added Y"
is a much better story than a finished, static project.
