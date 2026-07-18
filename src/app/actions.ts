"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { opportunities, opportunityUrls, type NewOpportunity } from "@/db/schema";

export type OpportunityInput = NewOpportunity & {
  urls: { label: string; url: string }[];
};

export async function createOpportunity(data: OpportunityInput) {
  const { urls, ...oppData } = data;
  const newOpp = await db.insert(opportunities).values(oppData).returning();

  if (urls.length > 0) {
    await db.insert(opportunityUrls).values(
      urls.map((u) => ({
        opportunityId: newOpp[0].id,
        label: u.label,
        url: u.url,
      }))
    );
  }
  revalidatePath("/");
}

export async function updateOpportunity(id: number, data: Partial<OpportunityInput>) {
  const { urls, ...oppData } = data;

  if (Object.keys(oppData).length > 0) {
    await db
      .update(opportunities)
      .set({ ...oppData, updatedAt: new Date() })
      .where(eq(opportunities.id, id));
  }

  if (urls !== undefined) {
    await db.delete(opportunityUrls).where(eq(opportunityUrls.opportunityId, id));
    if (urls.length > 0) {
      await db.insert(opportunityUrls).values(
        urls.map((u) => ({
          opportunityId: id,
          label: u.label,
          url: u.url,
        }))
      );
    }
  }
  revalidatePath("/");
}

export async function deleteOpportunity(id: number) {
  await db.delete(opportunities).where(eq(opportunities.id, id));
  revalidatePath("/");
}
