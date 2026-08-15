// Small inline SVG icon set for the sidebar/bottom nav — no external icon
// package, keeps the bundle light and every icon themeable via currentColor.
type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconQr({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM14 20h3M20 14v3M17.5 20H21v-3" />
    </svg>
  );
}

export function IconKey({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M11 12l7-7M15 8l3 3M18 5l3 3" />
    </svg>
  );
}

export function IconMail({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function IconChart({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 19V10M10 19V5M16 19v-7M22 19H2" />
    </svg>
  );
}

export function IconUsers({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 5.2c1.6.4 2.8 1.8 2.8 3.4 0 1.6-1.2 3-2.8 3.4M20 20c0-2.8-1.8-4.9-4.3-5.7" />
    </svg>
  );
}

export function IconApps({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function IconLogs({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function IconMenu({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function IconClose({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconLogout({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
