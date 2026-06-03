"use client";

import * as React from "react";

/** A faux WhatsApp "sent" bubble: green, self-colored (good in light + dark),
 *  rounded with a little tail, plus static decorative chrome (a fixed 9:41 time
 *  and double "read" ticks). The timestamp/ticks are purely cosmetic — a literal
 *  string, never `new Date()`, to avoid a hydration mismatch. Pure CSS/JSX so
 *  this file keeps its zero domain/lib import surface. */
export function WhatsappBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "12px 12px 14px",
        background: "var(--sunk)",
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "85%",
          padding: "7px 9px 5px 11px",
          background: "var(--wa-bubble)",
          color: "var(--wa-bubble-fg)",
          borderRadius: "12px 12px 4px 12px",
          boxShadow: "0 1px 1.5px rgba(0,0,0,0.28)",
          fontSize: 13.5,
          lineHeight: 1.45,
        }}
      >
        {/* tail on the bottom-right corner */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: -6,
            bottom: 0,
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderWidth: "0 0 9px 9px",
            borderColor: "transparent transparent transparent var(--wa-bubble)",
          }}
        />
        <span style={{ whiteSpace: "pre-wrap" }}>{children}</span>
        {/* meta row: static time + double read-ticks */}
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            float: "right",
            marginLeft: 10,
            marginTop: 4,
            transform: "translateY(3px)",
            fontSize: 10.5,
            lineHeight: 1,
            color: "var(--wa-bubble-meta)",
            whiteSpace: "nowrap",
          }}
        >
          9:41
          <svg width="15" height="11" viewBox="0 0 18 13" fill="none" aria-hidden>
            <path
              d="M1 7.2 4 10.2 10.6 2.8M7.4 9.4 8.6 10.6 15.2 3.2"
              stroke="#53bdeb"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
