"use client";

import { useState } from "react";
import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_COLOR } from "@/lib/constants";

export function CalendarView({ 
  items, 
  onItemClick 
}: { 
  items: OpportunityWithUrls[],
  onItemClick?: (item: OpportunityWithUrls) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Helper to check if an item matches a specific day
  const getItemsForDay = (day: number) => {
    const targetDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return items.filter(item => {
      // Check deadline
      if (item.deadline && item.deadline.startsWith(targetDateStr)) return true;
      // Check followUpDate
      if (item.followUpDate && item.followUpDate.startsWith(targetDateStr)) return true;
      return false;
    });
  };

  return (
    <div className="flex flex-col gap-4 mb-10">
      <div className="flex items-center justify-between rounded-2xl border-2 border-border bg-bg-card p-4 shadow-hard-2">
        <button
          onClick={prevMonth}
          className="rounded border-2 border-border bg-surface px-4 py-2 text-sm font-extrabold uppercase tracking-widest shadow-hard-1 transition-colors hover:bg-surface-2"
        >
          &larr; Prev
        </button>
        <h2 className="text-2xl font-extrabold tracking-tighter text-ink uppercase">
          {monthNames[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="rounded border-2 border-border bg-surface px-4 py-2 text-sm font-extrabold uppercase tracking-widest shadow-hard-1 transition-colors hover:bg-surface-2"
        >
          Next &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 sm:gap-3">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} className="text-center text-xs font-bold uppercase tracking-widest text-ink-muted">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[100px] rounded-lg border-2 border-dashed border-border/50 bg-bg-card/30" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayItems = getItemsForDay(day);
          const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

          return (
            <div
              key={day}
              className={`min-h-[100px] sm:min-h-[120px] flex flex-col gap-1 rounded-lg border-2 border-border p-2 ${
                isToday ? 'bg-primary/10 border-primary' : 'bg-bg-card shadow-hard-1'
              }`}
            >
              <div className={`text-right text-sm font-bold ${isToday ? 'text-primary' : 'text-ink-muted'}`}>
                {day}
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px] sm:max-h-[100px] custom-scrollbar">
                {dayItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => onItemClick?.(item)}
                    className="cursor-pointer truncate rounded border-2 border-border px-1.5 py-0.5 text-[10px] font-bold text-ink shadow-sm transition-opacity hover:opacity-75"
                    style={{ backgroundColor: STATUS_COLOR[item.status] }}
                    title={item.name}
                  >
                    {item.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
