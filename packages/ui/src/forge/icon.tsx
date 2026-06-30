import * as React from "react";

// Bespoke stroke icon set, ported 1:1 from the prototype (ui.jsx).
// Kept as hand-drawn SVG (not lucide) so the brutalist line weight and
// quirks match the design exactly. viewBox is 0 0 20 20 for every glyph.

export type IconName =
  | "home" | "check" | "plus" | "minus" | "users" | "user" | "search"
  | "arrow" | "arrowL" | "chev" | "chevD" | "back" | "close" | "alert"
  | "cash" | "card" | "swap" | "phone" | "wa" | "flame" | "clock" | "cal"
  | "bolt" | "settings" | "star" | "edit" | "trash" | "refresh" | "bell"
  | "receipt" | "sun" | "moon" | "copy" | "lock" | "bank" | "target" | "filter";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function Icon({
  name,
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
  className,
}: IconProps) {
  const s = {
    stroke: color,
    fill: "none",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 9l7-5 7 5v8H3z" {...s} /><path d="M8 17v-5h4v5" {...s} /></>,
    check: <path d="M4 10l4 4 8-8" {...s} strokeWidth={2.4} />,
    plus: <path d="M10 4v12M4 10h12" {...s} />,
    minus: <path d="M4 10h12" {...s} />,
    users: <><circle cx="8" cy="7" r="3" {...s} /><path d="M2 17c0-3 3-5 6-5s6 2 6 5" {...s} /><circle cx="15" cy="6" r="2.2" {...s} /><path d="M15 11c1.6 0 3.5 1 4 3" {...s} /></>,
    user: <><circle cx="10" cy="7" r="3" {...s} /><path d="M3 17c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5" {...s} /></>,
    search: <><circle cx="9" cy="9" r="5.5" {...s} /><path d="M13 13l4 4" {...s} /></>,
    arrow: <path d="M5 10h10M11 6l4 4-4 4" {...s} />,
    arrowL: <path d="M15 10H5M9 6l-4 4 4 4" {...s} />,
    chev: <path d="M7 5l5 5-5 5" {...s} />,
    chevD: <path d="M5 8l5 5 5-5" {...s} />,
    back: <path d="M13 5l-6 5 6 5" {...s} strokeWidth={2.2} />,
    close: <path d="M5 5l10 10M15 5L5 15" {...s} strokeWidth={2.2} />,
    alert: <><path d="M10 3l8 14H2z" {...s} /><path d="M10 9v3M10 14v.5" {...s} /></>,
    cash: <><rect x="2" y="6" width="16" height="10" rx="0.6" {...s} /><circle cx="10" cy="11" r="2.2" {...s} /></>,
    card: <><rect x="2" y="5" width="16" height="11" rx="0.6" {...s} /><path d="M2 9h16" {...s} /></>,
    swap: <path d="M4 7h12l-3-3M16 13H4l3 3" {...s} />,
    phone: <path d="M5 3h3l2 4-2 1c1 2 3 4 5 5l1-2 4 2v3a2 2 0 01-2 2C9 18 2 11 2 5a2 2 0 012-2z" {...s} />,
    wa: <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z" fill={color} stroke="none" />,
    flame: <path d="M10 3c1 3 4 4 4 8a4 4 0 11-8 0c0-2 1-3 2-4 0 1 1 2 2 2 0-2-1-4 0-6z" {...s} />,
    clock: <><circle cx="10" cy="10" r="7" {...s} /><path d="M10 6v4l3 2" {...s} /></>,
    cal: <><rect x="3" y="4" width="14" height="13" rx="0.6" {...s} /><path d="M3 8h14M7 2v3M13 2v3" {...s} /></>,
    bolt: <path d="M11 2l-7 10h5l-2 6 7-10h-5l2-6z" {...s} />,
    settings: <><circle cx="10" cy="10" r="2.5" {...s} /><path d="M10 1.5v2.5M10 16v2.5M1.5 10h2.5M16 10h2.5M4 4l1.8 1.8M14.2 14.2L16 16M4 16l1.8-1.8M14.2 5.8L16 4" {...s} /></>,
    star: <path d="M10 2l2.5 5.2 5.5.8-4 3.9 1 5.6L10 14.8 5 17.5l1-5.6-4-3.9 5.5-.8L10 2z" {...s} />,
    edit: <><path d="M3 14l9-9 3 3-9 9H3v-3z" {...s} /><path d="M11 3l3 3" {...s} /></>,
    trash: <path d="M3 6h14M8 3h4l1 3M5 6l1 11h8l1-11" {...s} />,
    refresh: <><path d="M3 10a7 7 0 0112-5l2 2M17 10a7 7 0 01-12 5l-2-2" {...s} /><path d="M14 4v3h3M6 16v-3H3" {...s} /></>,
    bell: <path d="M10 3a5 5 0 015 5v4l1.5 2h-13L5 12V8a5 5 0 015-5zM8 17a2 2 0 004 0" {...s} />,
    receipt: <><path d="M5 2h10v16l-2.5-1.5L10 18l-2.5-1.5L5 18V2z" {...s} /><path d="M8 6h4M8 9h4M8 12h4" {...s} /></>,
    sun: <><circle cx="10" cy="10" r="3.6" {...s} /><path d="M10 1.5v2.2M10 16.3v2.2M1.5 10h2.2M16.3 10h2.2M4.1 4.1l1.6 1.6M14.3 14.3l1.6 1.6M4.1 15.9l1.6-1.6M14.3 5.7l1.6-1.6" {...s} /></>,
    moon: <path d="M16 11.5A6.5 6.5 0 018.5 4a6.5 6.5 0 100 13 6.5 6.5 0 007.5-5.5z" {...s} />,
    copy: <><rect x="6" y="6" width="10" height="11" rx="1" {...s} /><path d="M12 6V4a1 1 0 00-1-1H4a1 1 0 00-1 1v9a1 1 0 001 1h2" {...s} /></>,
    lock: <><rect x="4" y="9" width="12" height="8" rx="1" {...s} /><path d="M7 9V6.5a3 3 0 016 0V9" {...s} /></>,
    bank: <><path d="M10 2.5L17 6H3l7-3.5z" {...s} /><path d="M4.5 8v6M8 8v6M12 8v6M15.5 8v6M3 16.5h14" {...s} /></>,
    target: <><circle cx="10" cy="10" r="7" {...s} /><circle cx="10" cy="10" r="3" {...s} /></>,
    filter: <path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7L3 4z" {...s} />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
