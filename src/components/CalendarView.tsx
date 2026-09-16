"use client";

import { useState } from "react";
import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_COLOR } from "@/lib/constants";
import { IconFlag, IconReply } from "./Icons";

type DayEntry = { item: OpportunityWithUrls; kind: "deadline" | "followUp" };

export function CalendarView({
  items,
  onItemClick,
  onAdd,
}: {
  items: OpportunityWithUrls[];
  onItemClick?: (item: OpportunityWithUrls) => void;
  onAdd?: () => void;
}) {
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const monthLabel = currentDate.toLocaleDateString("en", { month: "long", year: "numeric" });

  const getEntriesForDay = (day: number): DayEntry[] => {
    const target = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const out: DayEntry[] = [];
    for (const item of items) {
      if (item.deadline?.startsWith(target)) out.push({ item, kind: "deadline" });
      if (item.followUpDate?.startsWith(target)) out.push({ item, kind: "followUp" });
    }
    return out;
  };

  const hasAnyDates = items.some((i) => i.deadline || i.followUpDate);

  return (
    <div className="mb-10 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border bg-bg-card p-3 shadow-hard-2">
        <div className="flex items-center gap-2">
          <NavButton onClick={prevMonth} label="Previous month">←</NavButton>
          <NavButton onClick={nextMonth} label="Next month">→</NavButton>
          {!isCurrentMonth && (
            <button
              onClick={goToday}
              className="rounded border-2 border-border bg-primary px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-hard-1 btn-push-sm"
            >
              Today
            </button>
          )}
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">{monthLabel}</h2>
        <div className="flex items-center gap-4 text-2xs font-bold text-ink-muted">
          <span className="inline-flex items-center gap-1"><IconFlag className="text-danger" /> Deadline</span>
          <span className="inline-flex items-center gap-1"><IconReply className="text-secondary" /> Follow-up</span>
        </div>
      </div>

      {!hasAnyDates && (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center">
          <p className="font-extrabold text-ink">No dates to show</p>
          <p className="max-w-sm text-sm text-ink-muted">Add a deadline or follow-up date to an entry and it'll land on the calendar.</p>
          {onAdd && (
            <button onClick={onAdd} className="mt-1 rounded border-2 border-border bg-primary px-4 py-1.5 text-sm font-bold text-white shadow-hard-1 btn-push">
              + Log opportunity
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center text-[10px] font-bold uppercase tracking-widest text-ink-muted sm:text-xs">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[72px] rounded border-2 border-dashed border-border/30 sm:min-h-[110px]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const entries = getEntriesForDay(day);
          const isToday = isCurrentMonth && today.getDate() === day;

          return (
            <div
              key={day}
              className={`flex min-h-[72px] flex-col gap-1 rounded border-2 p-1.5 sm:min-h-[110px] sm:p-2 ${
                isToday ? "border-primary bg-primary/10" : "border-border bg-bg-card shadow-hard-1"
              }`}
            >
              <div className={`text-right text-xs font-bold sm:text-sm ${isToday ? "text-primary" : "text-ink-muted"}`}>
                {day}
              </div>
              <div className="custom-scrollbar flex max-h-[60px] flex-col gap-1 overflow-y-auto sm:max-h-[90px]">
                {entries.map(({ item, kind }) => (
                  <button
                    key={`${item.id}-${kind}`}
                    onClick={() => onItemClick?.(item)}
                    className="flex items-center gap-1 truncate rounded border-2 border-border px-1.5 py-0.5 text-left text-[10px] font-bold text-[#1c1b1b] shadow-sm transition-opacity hover:opacity-75 dark:text-ink"
                    style={{ backgroundColor: STATUS_COLOR[item.status] }}
                    title={`${item.name} — ${kind === "deadline" ? "deadline" : "follow-up"}`}
                  >
                    {kind === "deadline" ? <IconFlag className="shrink-0" /> : <IconReply className="shrink-0" />}
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded border-2 border-border bg-surface text-sm font-extrabold shadow-hard-1 transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
