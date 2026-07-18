"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { STATUS_LABEL, STATUS_ORDER, TYPE_LABEL } from "@/lib/constants";
import type { Opportunity, NewOpportunity, OpportunityWithUrls } from "@/db/schema";
import { createOpportunity, updateOpportunity, type OpportunityInput } from "@/app/actions";

type FormState = {
  type: Opportunity["type"];
  name: string;
  source: string;
  urls: { label: string; url: string }[];
  deadline: string;
  status: Opportunity["status"];
  referralContact: string;
  foundDate: string;
  followUpDate: string;
  nextAction: string;
  notes: string;
};

function toFormState(o?: OpportunityWithUrls | null): FormState {
  return {
    type: o?.type ?? "job",
    name: o?.name ?? "",
    source: o?.source ?? "",
    urls: o?.urls?.length ? [...o.urls] : [{ label: "", url: "" }],
    deadline: o?.deadline ? String(o.deadline).slice(0, 10) : "",
    status: o?.status ?? "found",
    referralContact: o?.referralContact ?? "",
    foundDate: o?.foundDate ? String(o.foundDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    followUpDate: o?.followUpDate ? String(o.followUpDate).slice(0, 10) : "",
    nextAction: o?.nextAction ?? "",
    notes: o?.notes ?? "",
  };
}

export function AddEditPanel({
  editing,
  onClose,
}: {
  editing: OpportunityWithUrls | null | "new";
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

    const validUrls = form.urls.filter((u) => u.label.trim() || u.url.trim());
    for (const u of validUrls) {
      if (u.url.trim() && !/^https?:\/\//i.test(u.url.trim())) {
        alert(`URL for "${u.label || "link"}" must start with http:// or https://`);
        return;
      }
      if (u.url.trim() && !u.label.trim()) {
        alert("Please provide a label for the URL: " + u.url);
        return;
      }
    }

    const payload: OpportunityInput = {
      type: form.type,
      name: form.name.trim(),
      source: form.source.trim() || null,
      urls: validUrls.map((u) => ({ label: u.label.trim(), url: u.url.trim() })),
      deadline: form.deadline || null,
      status: form.status,
      referralContact: form.referralContact.trim() || null,
      foundDate: form.foundDate || null,
      followUpDate: form.followUpDate || null,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border-2 border-border bg-bg-card p-6 shadow-hard-3"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-ink">
            {isEdit ? "Edit entry" : "Log a new opportunity"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded border-2 border-border bg-surface font-bold text-ink-muted hover:bg-surface-2 hover:text-ink"
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
                className={`flex-1 rounded border-2 border-border px-3 py-2 text-sm font-bold transition-colors ${
                  form.type === t
                    ? "bg-primary text-white shadow-hard-1"
                    : "bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
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
              className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Source</span>
              <input
                list="source-options"
                value={form.source}
                onChange={(e) => field("source", e.target.value)}
                placeholder="LinkedIn, Devfolio…"
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
              />
              <datalist id="source-options">
                <option value="LinkedIn" />
                <option value="Unstop" />
                <option value="Naukri" />
                <option value="Referral" />
                <option value="Cold email" />
                <option value="Other" />
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Deadline</span>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => field("deadline", e.target.value)}
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none focus:bg-primary-soft"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-ink-muted">Links</span>
            {form.urls.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  list="url-label-options"
                  value={u.label}
                  onChange={(e) => {
                    const newUrls = [...form.urls];
                    newUrls[i].label = e.target.value;
                    field("urls", newUrls);
                  }}
                  placeholder="e.g. Job Posting"
                  className="w-[30%] rounded border-2 border-border bg-bg-card px-2 py-1.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:bg-primary-soft"
                />
                <input
                  value={u.url}
                  onChange={(e) => {
                    const newUrls = [...form.urls];
                    newUrls[i].url = e.target.value;
                    field("urls", newUrls);
                  }}
                  placeholder="https://..."
                  className="w-[60%] flex-1 rounded border-2 border-border bg-bg-card px-2 py-1.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:bg-primary-soft"
                />
                <button
                  type="button"
                  onClick={() => field("urls", form.urls.filter((_, idx) => idx !== i))}
                  className="flex h-8 w-8 items-center justify-center rounded border-2 border-danger bg-danger-soft font-bold text-danger hover:bg-danger/20"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => field("urls", [...form.urls, { label: "", url: "" }])}
              className="self-start text-xs font-bold text-primary hover:underline"
            >
              + Add URL
            </button>
            <datalist id="url-label-options">
              <option value="Job Posting" />
              <option value="Application Portal" />
              <option value="Company Careers" />
              <option value="Referral Profile" />
              <option value="Glassdoor" />
              <option value="GitHub" />
              <option value="Notion / Doc" />
              <option value="Other" />
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Status</span>
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value as Opportunity["status"])}
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none"
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
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Found date</span>
              <input
                type="date"
                value={form.foundDate}
                onChange={(e) => field("foundDate", e.target.value)}
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none focus:bg-primary-soft"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Follow-up date</span>
              <input
                type="date"
                value={form.followUpDate}
                onChange={(e) => field("followUpDate", e.target.value)}
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none focus:bg-primary-soft"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Next action</span>
            <input
              value={form.nextAction}
              onChange={(e) => field("nextAction", e.target.value)}
              placeholder="What you need to do next"
              className="rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              rows={3}
              className="resize-none rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border-2 border-border bg-surface px-4 py-2 text-sm font-bold text-ink-muted shadow-hard-1 btn-push-sm hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded border-2 border-border bg-primary px-5 py-2 text-sm font-bold text-white shadow-hard-1 btn-push disabled:opacity-60"
          >
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add to tracker"}
          </button>
        </div>
      </form>
    </div>
  );
}
