"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { opportunities, type NewOpportunity } from "@/db/schema";

export async function createOpportunity(data: NewOpportunity) {
  await db.insert(opportunities).values(data);
  revalidatePath("/");
}

export async function updateOpportunity(id: number, data: Partial<NewOpportunity>) {
  await db
    .update(opportunities)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(opportunities.id, id));
  revalidatePath("/");
}

export async function deleteOpportunity(id: number) {
  await db.delete(opportunities).where(eq(opportunities.id, id));
  revalidatePath("/");
}
