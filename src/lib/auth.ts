import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError } from "better-auth/api";
import { db } from "../db";
import * as schema from "../db/schema";

// Comma-separated list of Google account emails allowed to sign up. Anyone
// else gets rejected at account creation. Required — an empty list would
// silently lock everyone out, so fail loudly at boot instead.
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (ALLOWED_EMAILS.length === 0) {
  throw new Error("ALLOWED_EMAILS is not set. Add a comma-separated list of emails to .env.local (see .env.example).");
}

const baseURL =
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

// The auth base URL, the public site URL (custom domain), and localhost for
// dev. Deduped so a value appearing twice doesn't matter.
const trustedOrigins = Array.from(
  new Set(
    [baseURL, process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000"].filter(
      (o): o is string => Boolean(o),
    ),
  ),
);

export const auth = betterAuth({
  baseURL,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email?.toLowerCase() ?? "";
          if (!ALLOWED_EMAILS.includes(email)) {
            throw new APIError("UNAUTHORIZED", {
              message: "Registration is restricted to authorized users only."
            });
          }
          return { data: user };
        },
      },
    },
  },
});
