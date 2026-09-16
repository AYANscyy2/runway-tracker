import { ImageResponse } from "next/og";
import { loadDmSans } from "@/lib/og-fonts";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ae2f34",
          color: "#fff",
          fontSize: 110,
          fontWeight: 800,
          letterSpacing: -4,
          fontFamily: "DM Sans",
        }}
      >
        R
      </div>
    ),
    { ...size, fonts: await loadDmSans() },
  );
}
