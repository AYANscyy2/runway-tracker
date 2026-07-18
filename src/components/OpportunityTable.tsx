"use client";

import { useState, useTransition } from "react";
import type { Opportunity, OpportunityWithUrls } from "@/db/schema";
import { TERMINAL_STATUSES, TYPE_LABEL } from "@/lib/constants";
import { DeadlineStamp } from "./DeadlineStamp";
import { StatusSelect } from "./StatusSelect";
import { deleteOpportunity, updateOpportunity } from "@/app/actions";
import { formatDeadline } from "@/lib/dates";

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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 border-border text-xs font-extrabold text-ink"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function OpportunityTable({
  items,
  onEdit,
  onAdd,
}: {
  items: OpportunityWithUrls[];
  onEdit: (item: OpportunityWithUrls) => void;
  onAdd: () => void;
}) {
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm font-bold text-ink-muted">
          Nothing here yet — start by logging your first opportunity.
        </p>
        <button
          onClick={onAdd}
          className="rounded border-2 border-border bg-primary px-5 py-2 text-sm font-bold text-white shadow-hard-1 btn-push"
        >
          + Log opportunity
        </button>
      </div>
    );
  }

  function handleStatusChange(item: Opportunity, status: Opportunity["status"]) {
    startTransition(async () => {
      await updateOpportunity(item.id, { status });
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Remove this entry? This can't be undone.")) return;
    startTransition(async () => {
      await deleteOpportunity(id);
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border-2 border-border shadow-hard-2">
      <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-2 text-[10px] font-bold uppercase tracking-widest text-ink">
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Links</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Referral</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Found</th>
            <th className="px-4 py-3">Follow-up</th>
            <th className="px-4 py-3">Deadline</th>
            <th className="px-4 py-3">Next action</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b-2 border-border/20 bg-bg-card last:border-0 hover:bg-surface"
            >
              {/* Type */}
              <td className="px-4 py-3 align-middle">
                <span className="text-xs font-bold text-ink-muted">
                  {TYPE_LABEL[item.type]}
                </span>
              </td>

              {/* Name — with avatar */}
              <td className="px-4 py-3 align-middle">
                <div className="flex items-center gap-2.5">
                  <CompanyAvatar name={item.name} />
                  <span className="font-bold text-ink">{item.name}</span>
                </div>
              </td>

              {/* Links */}
              <td className="px-4 py-3 align-middle">
                <LinksCell urls={item.urls} />
              </td>

              {/* Source */}
              <td className="px-4 py-3 align-middle">
                <span className="text-xs text-ink-muted">{item.source || "—"}</span>
              </td>

              {/* Referral */}
              <td className="px-4 py-3 align-middle">
                <span className="text-xs text-ink-muted">{item.referralContact || "—"}</span>
              </td>

              {/* Status */}
              <td className="px-4 py-3 align-middle">
                <StatusSelect
                  value={item.status}
                  onChange={(next) => handleStatusChange(item, next)}
                />
              </td>

              {/* Found date */}
              <td className="px-4 py-3 align-middle">
                <span className="text-xs text-ink-muted">{formatDeadline(item.foundDate)}</span>
              </td>

              {/* Follow-up date */}
              <td className="px-4 py-3 align-middle">
                <span className="text-xs text-ink-muted">{formatDeadline(item.followUpDate)}</span>
              </td>

              {/* Deadline */}
              <td className="px-4 py-3 align-middle">
                <DeadlineStamp
                  deadline={item.deadline}
                  isTerminal={TERMINAL_STATUSES.includes(item.status)}
                />
              </td>

              {/* Next action */}
              <td className="max-w-[200px] px-4 py-3 align-middle">
                <span className="text-xs text-ink-muted">{item.nextAction || "—"}</span>
              </td>

              {/* Actions */}
              <td className="px-4 py-3 align-middle">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(item)}
                    className="rounded border-2 border-border bg-bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink shadow-hard-1 btn-push-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="rounded border-2 border-danger bg-danger-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-danger shadow-hard-1 btn-push-sm hover:bg-danger/20"
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
