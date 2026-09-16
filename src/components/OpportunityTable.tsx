"use client";

import { Fragment, useMemo, useOptimistic, useState, useTransition } from "react";
import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_ORDER, TYPE_LABEL, deadlineMatters, type Status } from "@/lib/constants";
import { DeadlineStamp } from "./DeadlineStamp";
import { StatusSelect } from "./StatusSelect";
import { updateOpportunity } from "@/app/actions";
import { daysUntil, formatDeadline, urgencyFor } from "@/lib/dates";
import { useToast } from "./Toast";
import { IconChevron } from "./Icons";

// Avatar color list — chosen by charCode of first letter
const AVATAR_COLORS = [
  "#70d7ff", "#ff9d5f", "#c584ff", "#ffe57d",
  "#5de6d3", "#ff7b95", "#7cffa4", "#ff8f4c",
];

function CompanyAvatar({ name }: { name: string }) {
  const bg = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div
      style={{ backgroundColor: bg }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 border-border text-xs font-extrabold text-[#1c1b1b]"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

type SortKey = "deadline" | "name" | "status" | "followUp";
type Sort = { key: SortKey; dir: 1 | -1 };

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "name",     label: "Name" },
  { key: "status",   label: "Status" },
  { key: "deadline", label: "Deadline" },
  { key: null,       label: "Next action", className: "hidden lg:table-cell" },
  { key: null,       label: "Links", className: "hidden xl:table-cell" },
  { key: null,       label: "" },
];

// Default order: upcoming actionable deadlines first (soonest on top), then
// entries whose deadline doesn't matter or is missing, and overdue last.
function deadlineRank(i: OpportunityWithUrls): [number, number] {
  const d = daysUntil(i.deadline);
  if (d === null || !deadlineMatters(i.type, i.status)) return [1, d ?? Number.MAX_SAFE_INTEGER];
  return d < 0 ? [2, -d] : [0, d];
}

function compare(a: OpportunityWithUrls, b: OpportunityWithUrls, { key, dir }: Sort) {
  const byDate = (x: string | null, y: string | null) => {
    const dx = daysUntil(x), dy = daysUntil(y);
    if (dx === null && dy === null) return 0;
    if (dx === null) return 1;   // empty dates sink regardless of direction
    if (dy === null) return -1;
    return (dx - dy) * dir;
  };
  switch (key) {
    case "name":     return a.name.localeCompare(b.name) * dir;
    case "status":   return (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * dir;
    case "followUp": return byDate(a.followUpDate, b.followUpDate);
    default: {
      const [ga, da] = deadlineRank(a), [gb, db] = deadlineRank(b);
      return ga !== gb ? (ga - gb) * dir : (da - db) * dir;
    }
  }
}

// Left-edge tint so urgent rows read at a glance without a separate banner.
const ROW_URGENCY: Record<ReturnType<typeof urgencyFor>, string> = {
  none:    "border-l-transparent",
  ok:      "border-l-transparent",
  soon:    "border-l-tertiary",
  urgent:  "border-l-danger",
  overdue: "border-l-ink-faint opacity-70",
};

export function OpportunityTable({
  items,
  totalCount,
  onEdit,
  onAdd,
  onClearFilters,
}: {
  items: OpportunityWithUrls[];
  totalCount: number;
  onEdit: (item: OpportunityWithUrls) => void;
  onAdd: () => void;
  onClearFilters: () => void;
}) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [sort, setSort] = useState<Sort>({ key: "deadline", dir: 1 });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  // Status flips show instantly; the server result reconciles on revalidate.
  const [optimisticItems, setOptimisticStatus] = useOptimistic(
    items,
    (state, patch: { id: number; status: Status }) =>
      state.map((i) => (i.id === patch.id ? { ...i, status: patch.status } : i)),
  );

  const sorted = useMemo(
    () => [...optimisticItems].sort((a, b) => compare(a, b, sort)),
    [optimisticItems, sort],
  );

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function handleStatusChange(item: OpportunityWithUrls, status: Status) {
    setPendingIds((s) => new Set(s).add(item.id));
    startTransition(async () => {
      setOptimisticStatus({ id: item.id, status });
      const res = await updateOpportunity(item.id, { status });
      setPendingIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
      if (!res.ok) toast.push({ message: `Couldn't update ${item.name}: ${res.error}`, tone: "danger" });
    });
  }

  if (totalCount === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Log the first company or hackathon you're eyeing and it'll show up here, sorted by deadline."
        action={{ label: "+ Log opportunity", onClick: onAdd }}
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No matches"
        body="Nothing fits the current search and filters."
        action={{ label: "Clear filters", onClick: onClearFilters }}
      />
    );
  }

  return (
    <>
      {/* ── Desktop table ── */}
      <div className="hidden overflow-hidden rounded-lg border-2 border-border shadow-hard-2 md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-surface-2 text-[10px] font-bold uppercase tracking-widest text-ink">
              {COLUMNS.map((c) => (
                <th key={c.label} className={`px-4 py-3 ${c.className ?? ""}`}>
                  {c.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key!)}
                      className="inline-flex items-center gap-1 uppercase hover:text-primary"
                      aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    >
                      {c.label}
                      <span className={sort.key === c.key ? "text-primary" : "text-ink-faint"}>
                        {sort.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const isOpen = expanded === item.id;
              const isPending = pendingIds.has(item.id);
              const urgency = urgencyFor(item.deadline, !deadlineMatters(item.type, item.status));
              return (
                <Fragment key={item.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className={`cursor-pointer border-b-2 border-l-4 border-border/20 bg-bg-card transition-opacity hover:bg-surface ${ROW_URGENCY[urgency]} ${isPending ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <IconChevron open={isOpen} className="shrink-0 text-xs text-ink-faint" />
                        <CompanyAvatar name={item.name} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-ink">{item.name}</p>
                          <p className="text-2xs text-ink-muted">
                            {TYPE_LABEL[item.type]}{item.source ? ` · ${item.source}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect type={item.type} value={item.status} disabled={isPending} onChange={(next) => handleStatusChange(item, next)} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <DeadlineStamp deadline={item.deadline} muted={!deadlineMatters(item.type, item.status)} />
                    </td>
                    <td className="hidden max-w-[240px] px-4 py-3 align-middle lg:table-cell">
                      <span className="line-clamp-2 text-xs text-ink-muted">{item.nextAction || "—"}</span>
                    </td>
                    <td className="hidden px-4 py-3 align-middle xl:table-cell" onClick={(e) => e.stopPropagation()}>
                      <LinksCell urls={item.urls} />
                    </td>
                    <td className="px-4 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <EditButton onClick={() => onEdit(item)} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b-2 border-l-4 border-border/20 border-l-transparent bg-surface">
                      <td colSpan={COLUMNS.length} className="px-4 py-3">
                        <Details item={item} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <ul className="flex flex-col gap-3 md:hidden">
        {sorted.map((item) => {
          const isPending = pendingIds.has(item.id);
          const urgency = urgencyFor(item.deadline, !deadlineMatters(item.type, item.status));
          return (
            <li
              key={item.id}
              className={`rounded-lg border-2 border-l-4 border-border bg-bg-card p-3 shadow-hard-1 ${ROW_URGENCY[urgency]} ${isPending ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CompanyAvatar name={item.name} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{item.name}</p>
                    <p className="text-2xs text-ink-muted">
                      {TYPE_LABEL[item.type]}{item.source ? ` · ${item.source}` : ""}
                    </p>
                  </div>
                </div>
                <EditButton onClick={() => onEdit(item)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <StatusSelect type={item.type} value={item.status} disabled={isPending} onChange={(next) => handleStatusChange(item, next)} />
                <DeadlineStamp deadline={item.deadline} muted={!deadlineMatters(item.type, item.status)} />
              </div>
              {item.nextAction && (
                <p className="mt-2 text-xs text-ink-muted"><span className="font-bold text-ink">Next:</span> {item.nextAction}</p>
              )}
              {item.urls.length > 0 && <div className="mt-2"><LinksCell urls={item.urls} /></div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Details({ item }: { item: OpportunityWithUrls }) {
  const rows: [string, React.ReactNode][] = [
    ["Referral", item.referralContact || "—"],
    ["Found", formatDeadline(item.foundDate)],
    ["Follow-up", formatDeadline(item.followUpDate)],
    ["Links", <LinksCell key="l" urls={item.urls} />],
    ["Next action", item.nextAction || "—"],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
      {rows.map(([k, v]) => (
        <div key={k}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">{k}</p>
          <div className="mt-0.5 text-ink">{v}</div>
        </div>
      ))}
      {item.notes && (
        <div className="col-span-full">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">Notes</p>
          <p className="mt-0.5 whitespace-pre-wrap text-ink">{item.notes}</p>
        </div>
      )}
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded border-2 border-border bg-bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink shadow-hard-1 btn-push-sm"
    >
      Edit
    </button>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-16 text-center">
      <p className="text-base font-extrabold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{body}</p>
      <button
        onClick={action.onClick}
        className="mt-2 rounded border-2 border-border bg-primary px-5 py-2 text-sm font-bold text-white shadow-hard-1 btn-push"
      >
        {action.label}
      </button>
    </div>
  );
}

function LinksCell({ urls }: { urls: OpportunityWithUrls["urls"] }) {
  const [expanded, setExpanded] = useState(false);

  if (!urls || urls.length === 0) {
    return <span className="text-xs text-ink-muted">—</span>;
  }

  const isTruncated = !expanded && urls.length > 3;
  const displayUrls = isTruncated ? urls.slice(0, 2) : urls;

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayUrls.map((u, i) => (
        <a
          key={i}
          href={u.url}
          target="_blank"
          rel="noopener noreferrer"
          title={u.url}
          className="rounded border-2 border-border bg-bg-card px-2 py-0.5 text-[11px] font-bold text-ink shadow-hard-1 btn-push-sm"
        >
          {u.label}
        </a>
      ))}
      {isTruncated && (
        <button
          onClick={() => setExpanded(true)}
          className="rounded border-2 border-border bg-surface px-2 py-0.5 text-[11px] font-bold text-ink-muted shadow-hard-1 btn-push-sm"
        >
          +{urls.length - 2} more
        </button>
      )}
    </div>
  );
}
