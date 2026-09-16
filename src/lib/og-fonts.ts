/**
 * Loads DM Sans for next/og image generation. Satori can't use woff2, so we
 * ask Google Fonts with a bare User-Agent, which returns TTF URLs.
 */
export async function loadDmSans(): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800 }[]> {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;800&display=swap",
    { headers: { "User-Agent": "Mozilla/4.0" } },
  ).then((r) => r.text());

  const faces = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)];
  const out = await Promise.all(
    faces.map(async ([, weight, url]) => ({
      name: "DM Sans",
      data: await fetch(url).then((r) => r.arrayBuffer()),
      weight: Number(weight) as 500 | 800,
    })),
  );
  return out;
}
