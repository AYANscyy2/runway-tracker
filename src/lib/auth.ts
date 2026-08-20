import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError } from "better-auth/api";
import { db } from "../db";
import * as schema from "../db/schema";

const ALLOWED_EMAILS = ["dhruti29032004@gmail.com", "mayan6378@gmail.com"];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  trustedOrigins: ["http://localhost:3000", "https://localhost:3000"],
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
