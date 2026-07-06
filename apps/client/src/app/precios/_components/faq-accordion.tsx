"use client";

import { useState } from "react";

import type { FaqPublicaDTO } from "@gym/data/server/marketing";

/**
 * The Precios FAQ accordion — the mock's `pr-faq` behavior: one question open at a time, tap to toggle.
 * A client island because the open/close state is the only interactivity on an otherwise static server
 * page; the questions/answers arrive pre-read from the DB (props), so no data fetching happens here.
 */
export function FaqAccordion({ faqs }: { faqs: FaqPublicaDTO[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {faqs.map((faq) => {
        const open = openId === faq.id;
        return (
          <div key={faq.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : faq.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
            >
              <span className="text-sm font-semibold text-fg">{faq.question}</span>
              <span
                aria-hidden
                className={`shrink-0 text-lg leading-none text-accent transition-transform ${
                  open ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            {open && (
              <p className="border-t border-line px-4 py-4 text-sm leading-relaxed text-muted">
                {faq.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
