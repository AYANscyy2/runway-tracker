"use client";

import { STATUS_CLASSES, STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
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
      className={`rounded-sm border px-2 py-1 font-mono text-xs ${STATUS_CLASSES[value]} cursor-pointer bg-transparent`}
      aria-label="Status"
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s} className="bg-surface text-ink">
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
