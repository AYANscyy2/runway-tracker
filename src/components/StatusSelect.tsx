"use client";

import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import type { Opportunity } from "@/db/schema";

export function StatusSelect({
  value,
  onChange,
}: {
  value: Opportunity["status"];
  onChange: (next: Opportunity["status"]) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Opportunity["status"])}
      style={{ backgroundColor: STATUS_COLOR[value] }}
      className="cursor-pointer rounded border-2 border-border px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-ink outline-none"
      aria-label="Status"
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s} style={{ backgroundColor: STATUS_COLOR[s] }}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
