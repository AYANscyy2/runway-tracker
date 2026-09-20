import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { QuotaError } from "./extract";

export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
export const EMBED_DIMENSIONS = 768;

// One request carries many chunks, so a posting costs one embedding call
// rather than one per section.
const BATCH = 64;

function isQuota(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b/i.test(m);
}

/**
 * gemini-embedding-001 returns 3072 dimensions by default and supports
 * Matryoshka truncation; 768 is asked for explicitly because that is what the
 * column is and a mismatch fails at insert time, not here.
 */
const providerOptions = { google: { outputDimensionality: EMBED_DIMENSIONS } };

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += BATCH) {
      const { embeddings } = await embedMany({
        model: google.textEmbedding(EMBED_MODEL),
        values: texts.slice(i, i + BATCH),
        providerOptions,
        maxRetries: 0,
      });
      out.push(...embeddings);
    }
  } catch (e) {
    if (isQuota(e)) throw new QuotaError(e);
    throw e;
  }
  return out;
}

/** A search query is embedded with the same model, so it lands in the same
 * space as the chunks it is compared against. */
export async function embedQuery(query: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: google.textEmbedding(EMBED_MODEL),
      value: query,
      providerOptions,
      maxRetries: 0,
    });
    return embedding;
  } catch (e) {
    if (isQuota(e)) throw new QuotaError(e);
    throw e;
  }
}
