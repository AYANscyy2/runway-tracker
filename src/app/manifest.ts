import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Runway — application tracker",
    short_name: "Runway",
    description: "Track job applications and hackathons — deadlines, follow-ups and next actions — in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcf9f8",
    theme_color: "#ae2f34",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
