// Small inline SVG set so nav glyphs render identically across fonts.
type IconProps = { className?: string };

const base = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
};

export function IconGrid({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconChart({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  );
}

export function IconChevron({ className, open }: IconProps & { open?: boolean }) {
  return (
    <svg {...base} className={`${className ?? ""} transition-transform ${open ? "rotate-90" : ""}`}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconFlag({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 21V4h13l-2 4 2 4H5" />
    </svg>
  );
}

export function IconReply({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}
