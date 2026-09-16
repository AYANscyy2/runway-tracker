"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { STATUS_FOR_TYPE, STATUS_LABEL, TYPE_LABEL, type Status } from "@/lib/constants";
import type { OpportunityWithUrls } from "@/db/schema";
import { createOpportunity, updateOpportunity, type OpportunityInput } from "@/app/actions";
import { useToast } from "./Toast";

type FormState = {
  type: OpportunityWithUrls["type"];
  name: string;
  source: string;
  urls: { label: string; url: string }[];
  deadline: string;
  status: Status;
  referralContact: string;
  foundDate: string;
  followUpDate: string;
  nextAction: string;
  notes: string;
};

type Errors = Partial<Record<"name" | "deadline", string>> & { urls?: Record<number, string> };

function toFormState(o?: OpportunityWithUrls | null): FormState {
  return {
    type: o?.type ?? "job",
    name: o?.name ?? "",
    source: o?.source ?? "",
    urls: o?.urls?.length ? o.urls.map((u) => ({ label: u.label, url: u.url })) : [{ label: "", url: "" }],
    deadline: o?.deadline ? String(o.deadline).slice(0, 10) : "",
    status: o?.status ?? "found",
    referralContact: o?.referralContact ?? "",
    foundDate: o?.foundDate ? String(o.foundDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    followUpDate: o?.followUpDate ? String(o.followUpDate).slice(0, 10) : "",
    nextAction: o?.nextAction ?? "",
    notes: o?.notes ?? "",
  };
}

const inputCls =
  "rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft aria-[invalid=true]:border-danger";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function AddEditPanel({
  editing,
  onClose,
  onDelete,
}: {
  editing: OpportunityWithUrls | "new";
  onClose: () => void;
  onDelete: (item: OpportunityWithUrls) => void;
}) {
  const toast = useToast();
  const isEdit = editing !== "new";
  const [form, setForm] = useState<FormState>(() => toFormState(isEdit ? editing : null));
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    const dialog = dialogRef.current;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      // Minimal focus trap: keep Tab cycling inside the dialog.
      if (e.key === "Tab" && dialog) {
        const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setType(t: FormState["type"]) {
    setForm((f) => ({
      ...f,
      type: t,
      // Don't leave a status that doesn't exist for the new type.
      status: STATUS_FOR_TYPE[t].includes(f.status) ? f.status : "found",
    }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!form.name.trim()) next.name = "Name is required.";
    form.urls.forEach((u, i) => {
      const url = u.url.trim(), label = u.label.trim();
      if (!url && !label) return;
      if (url && !/^https?:\/\//i.test(url)) (next.urls ??= {})[i] = "Must start with http:// or https://";
      else if (url && !label) (next.urls ??= {})[i] = "Give this link a label.";
      else if (label && !url) (next.urls ??= {})[i] = "Paste the URL.";
    });
    return next;
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.name) nameInputRef.current?.focus();
      return;
    }

    const payload: OpportunityInput = {
      type: form.type,
      name: form.name.trim(),
      source: form.source.trim() || null,
      urls: form.urls.filter((u) => u.url.trim()).map((u) => ({ label: u.label.trim(), url: u.url.trim() })),
      deadline: form.deadline || null,
      status: form.status,
      referralContact: form.referralContact.trim() || null,
      foundDate: form.foundDate || null,
      followUpDate: form.followUpDate || null,
      nextAction: form.nextAction.trim() || null,
      notes: form.notes.trim() || null,
    };

    startTransition(async () => {
      const res = isEdit ? await updateOpportunity(editing.id, payload) : await createOpportunity(payload);
      if (!res.ok) {
        toast.push({ message: `Couldn't save: ${res.error}`, tone: "danger" });
        return;
      }
      toast.push({ message: isEdit ? `Saved ${payload.name}` : `Added ${payload.name}` });
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSubmit(); }
        }}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border-2 border-border bg-bg-card p-6 shadow-hard-3"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="panel-title" className="text-base font-extrabold text-ink">
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

        {/* ── Shared fields ── */}
        <Section title="Opportunity" hint="Shared with everyone on Runway">
          <div className="flex gap-2">
            {(["job", "hackathon"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={form.type === t}
                className={`flex-1 rounded border-2 border-border px-3 py-2 text-sm font-bold transition-colors ${
                  form.type === t ? "bg-primary text-white shadow-hard-1" : "bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <Field label={form.type === "job" ? "Company name" : "Hackathon name"} error={errors.name}>
            <input
              ref={nameInputRef}
              value={form.name}
              onChange={(e) => { field("name", e.target.value); if (errors.name) setErrors((er) => ({ ...er, name: undefined })); }}
              placeholder={form.type === "job" ? "e.g. Razorpay" : "e.g. HackIndia Spark"}
              aria-invalid={!!errors.name}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <input
                list="source-options"
                value={form.source}
                onChange={(e) => field("source", e.target.value)}
                placeholder="LinkedIn, Devfolio…"
                className={inputCls}
              />
              <datalist id="source-options">
                {["LinkedIn", "Unstop", "Devfolio", "Naukri", "Referral", "Cold email", "Other"].map((s) => <option key={s} value={s} />)}
              </datalist>
            </Field>
            <Field label={form.type === "job" ? "Deadline" : "Event date"}>
              <input type="date" value={form.deadline} onChange={(e) => field("deadline", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-ink-muted">Links</span>
            {form.urls.map((u, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <input
                    list="url-label-options"
                    value={u.label}
                    onChange={(e) => {
                      const newUrls = form.urls.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x));
                      field("urls", newUrls);
                    }}
                    placeholder="Label"
                    aria-invalid={!!errors.urls?.[i]}
                    className={`w-[32%] ${inputCls} shadow-none px-2 py-1.5`}
                  />
                  <input
                    value={u.url}
                    onChange={(e) => {
                      const newUrls = form.urls.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x));
                      field("urls", newUrls);
                    }}
                    placeholder="https://…"
                    aria-invalid={!!errors.urls?.[i]}
                    className={`flex-1 ${inputCls} shadow-none px-2 py-1.5`}
                  />
                  <button
                    type="button"
                    onClick={() => field("urls", form.urls.filter((_, idx) => idx !== i))}
                    aria-label="Remove link"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded border-2 border-border bg-surface font-bold text-ink-muted hover:border-danger hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
                {errors.urls?.[i] && <p className="mt-1 text-2xs font-bold text-danger">{errors.urls[i]}</p>}
              </div>
            ))}
            <button
              type="button"
              onClick={() => field("urls", [...form.urls, { label: "", url: "" }])}
              className="self-start text-xs font-bold text-primary hover:underline"
            >
              + Add link
            </button>
            <datalist id="url-label-options">
              {["Job Posting", "Application Portal", "Company Careers", "Referral Profile", "Glassdoor", "GitHub", "Notion / Doc", "Other"].map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        </Section>

        {/* ── Personal fields ── */}
        <Section title="Your tracking" hint="Only you see these">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value as Status)}
                className={inputCls}
              >
                {STATUS_FOR_TYPE[form.type].map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Referral contact">
              <input
                value={form.referralContact}
                onChange={(e) => field("referralContact", e.target.value)}
                placeholder="optional"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Found date">
              <input type="date" value={form.foundDate} onChange={(e) => field("foundDate", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Follow-up date">
              <input type="date" value={form.followUpDate} onChange={(e) => field("followUpDate", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Next action">
            <input
              value={form.nextAction}
              onChange={(e) => field("nextAction", e.target.value)}
              placeholder="What you need to do next"
              className={inputCls}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              rows={3}
              className={`resize-none ${inputCls}`}
            />
          </Field>
        </Section>

        <div className="mt-6 flex items-center justify-between gap-2">
          {isEdit ? (
            <button
              type="button"
              onClick={() => onDelete(editing)}
              className="text-xs font-bold text-danger hover:underline"
            >
              Delete entry
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <span className="hidden text-2xs text-ink-faint sm:inline">⌘/Ctrl + Enter</span>
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
        </div>
      </form>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 flex flex-col gap-4 rounded border-2 border-border/30 p-4 pt-3">
      <legend className="flex items-baseline gap-2 px-1">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink">{title}</span>
        <span className="text-2xs text-ink-faint">{hint}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-muted">{label}</span>
      {children}
      {error && <span className="text-2xs font-bold text-danger">{error}</span>}
    </label>
  );
}
