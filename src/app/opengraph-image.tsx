import { ImageResponse } from "next/og";
import { loadDmSans } from "@/lib/og-fonts";

export const alt = "Runway — every opportunity, one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#fcf9f8",
          color: "#1c1b1b",
          fontFamily: "DM Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 18,
              background: "#ae2f34",
              border: "4px solid #1a1a1a",
              boxShadow: "8px 8px 0 #1a1a1a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 800,
            }}
          >
            R
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, color: "#ae2f34", letterSpacing: -2 }}>Runway</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05 }}>
            <span>Every opportunity.</span>
            <span>One place.</span>
          </div>
          <div style={{ fontSize: 30, color: "#584140", maxWidth: 900 }}>
            Track job applications and hackathons — deadlines, follow-ups and next actions — without losing the thread.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {["Found", "Applied", "In Progress", "Selected"].map((s, i) => (
            <div
              key={s}
              style={{
                padding: "10px 20px",
                borderRadius: 6,
                border: "3px solid #1a1a1a",
                background: ["#f5c84b", "#4ab3f4", "#b07aff", "#3dba78"][i],
                fontSize: 22,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: await loadDmSans() },
  );
}
