"use client";

import { useTransition } from "react";
import type { Opportunity } from "@/db/schema";
import { TERMINAL_STATUSES, TYPE_LABEL } from "@/lib/constants";
import { DeadlineStamp } from "./DeadlineStamp";
import { StatusSelect } from "./StatusSelect";
import { deleteOpportunity, updateOpportunity } from "@/app/actions";

export function OpportunityTable({
  items,
  onEdit,
}: {
  items: Opportunity[];
  onEdit: (item: Opportunity) => void;
}) {
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-6 py-14 text-center">
        <p className="text-sm text-ink-muted">
          Nothing here yet. Add the first company or hackathon you&apos;re tracking.
        </p>
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
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-ink-muted">
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Deadline</th>
            <th className="px-4 py-3 font-medium">Next action</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="px-4 py-3 align-top">
                <span className="text-xs text-ink-muted">{TYPE_LABEL[item.type]}</span>
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex flex-col">
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink hover:text-amber hover:underline"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <span className="font-medium text-ink">{item.name}</span>
                  )}
                  {item.source && <span className="text-xs text-ink-muted">{item.source}</span>}
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <StatusSelect
                  value={item.status}
                  onChange={(next) => handleStatusChange(item, next)}
                />
              </td>
              <td className="px-4 py-3 align-top">
                <DeadlineStamp
                  deadline={item.deadline}
                  isTerminal={TERMINAL_STATUSES.includes(item.status)}
                />
              </td>
              <td className="max-w-[220px] px-4 py-3 align-top text-ink-muted">
                {item.nextAction || "—"}
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex justify-end gap-3 text-xs">
                  <button
                    onClick={() => onEdit(item)}
                    className="text-ink-muted hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-ink-muted hover:text-danger"
                  >
                    Delete
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
