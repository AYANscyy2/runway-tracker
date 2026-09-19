import { revalidatePath } from "next/cache";

/**
 * Server action errors are masked in production, so actions return failures as
 * data and let the client show a toast instead of throwing across the boundary.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export async function run<T>(fn: () => Promise<T>, opts: { revalidate?: string } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (opts.revalidate) revalidatePath(opts.revalidate);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
