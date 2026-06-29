"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { STATUS_LABEL, STATUS_ORDER, TYPE_LABEL } from "@/lib/constants";
import type { Opportunity, NewOpportunity } from "@/db/schema";
import { createOpportunity, updateOpportunity } from "@/app/actions";

type FormState = {
  type: Opportunity["type"];
  name: string;
  source: string;
  link: string;
  deadline: string;
  status: Opportunity["status"];
  referralContact: string;
  nextAction: string;
  notes: string;
};

function toFormState(o?: Opportunity | null): FormState {
  return {
    type: o?.type ?? "job",
    name: o?.name ?? "",
    source: o?.source ?? "",
    link: o?.link ?? "",
    deadline: o?.deadline ? String(o.deadline).slice(0, 10) : "",
    status: o?.status ?? "found",
    referralContact: o?.referralContact ?? "",
    nextAction: o?.nextAction ?? "",
    notes: o?.notes ?? "",
  };
}

export function AddEditPanel({
  editing,
  onClose,
}: {
  editing: Opportunity | null | "new";
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    toFormState(editing === "new" ? null : editing)
  );
  const [isPending, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isEdit = editing !== "new" && editing !== null;

  useEffect(() => {
    nameInputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const payload: NewOpportunity = {
      type: form.type,
      name: form.name.trim(),
      source: form.source.trim() || null,
      link: form.link.trim() || null,
      deadline: form.deadline || null,
      status: form.status,
      referralContact: form.referralContact.trim() || null,
      nextAction: form.nextAction.trim() || null,
      notes: form.notes.trim() || null,
    };

    startTransition(async () => {
      if (isEdit) {
        await updateOpportunity(editing.id, payload);
      } else {
        await createOpportunity(payload);
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border bg-surface p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {isEdit ? "Edit entry" : "Log a new opportunity"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(["job", "hackathon"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => field("type", t)}
                className={`flex-1 rounded-sm border px-3 py-2 text-sm transition-colors ${
                  form.type === t
                    ? "border-amber bg-amber-soft text-amber"
                    : "border-border text-ink-muted hover:text-ink"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">
              {form.type === "job" ? "Company name" : "Hackathon name"}
            </span>
            <input
              ref={nameInputRef}
              required
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
              placeholder={form.type === "job" ? "e.g. Razorpay" : "e.g. HackIndia Spark"}
              className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Source</span>
              <input
                value={form.source}
                onChange={(e) => field("source", e.target.value)}
                placeholder="LinkedIn, Devfolio…"
                className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Deadline</span>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => field("deadline", e.target.value)}
                className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none [color-scheme:dark]"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Link</span>
            <input
              value={form.link}
              onChange={(e) => field("link", e.target.value)}
              placeholder="https://…"
              className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Status</span>
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value as Opportunity["status"])}
                className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Referral contact</span>
              <input
                value={form.referralContact}
                onChange={(e) => field("referralContact", e.target.value)}
                placeholder="optional"
                className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/60"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Next action</span>
            <input
              value={form.nextAction}
              onChange={(e) => field("nextAction", e.target.value)}
              placeholder="What you need to do next"
              className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/60"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              rows={3}
              className="resize-none rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/60"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-4 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-sm bg-amber px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
          >
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add to tracker"}
          </button>
        </div>
      </form>
    </div>
  );
}
