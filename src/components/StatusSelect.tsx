"use client";

import { STATUS_COLOR, STATUS_FOR_TYPE, STATUS_LABEL, type OppType, type Status } from "@/lib/constants";

export function StatusSelect({
  type,
  value,
  onChange,
  disabled,
}: {
  type: OppType;
  value: Status;
  onChange: (next: Status) => void;
  disabled?: boolean;
}) {
  // Keep the current value selectable even if it isn't valid for this type
  // (e.g. legacy data) so the select never shows a blank.
  const options = STATUS_FOR_TYPE[type].includes(value)
    ? STATUS_FOR_TYPE[type]
    : [...STATUS_FOR_TYPE[type], value];

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Status)}
      style={{ backgroundColor: STATUS_COLOR[value] }}
      className="cursor-pointer rounded border-2 border-border px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-ink outline-none disabled:cursor-wait"
      aria-label="Status"
    >
      {options.map((s) => (
        <option key={s} value={s} style={{ backgroundColor: STATUS_COLOR[s] }}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
