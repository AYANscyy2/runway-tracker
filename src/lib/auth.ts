import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../db";
import * as schema from "../db/schema";

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
});
