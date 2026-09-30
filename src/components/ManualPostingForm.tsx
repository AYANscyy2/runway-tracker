"use client";

import { useState, useTransition } from "react";
import { addManualPosting, type ManualPostingInput } from "@/app/inbox/actions";
import { useToast } from "./Toast";

const inputCls =
  "w-full rounded border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:bg-primary-soft";

type Remote = ManualPostingInput["remote"];
type Kind = "job" | "hackathon";

const REMOTE: Record<Kind, { value: Remote; label: string }[]> = {
  job: [
    { value: "unclear", label: "Not stated" },
    { value: "onsite", label: "On-site" },
    { value: "hybrid", label: "Hybrid" },
    { value: "remote", label: "Remote" },
  ],
  hackathon: [
    { value: "unclear", label: "Not stated" },
    { value: "remote", label: "Online" },
    { value: "onsite", label: "In person" },
    { value: "hybrid", label: "Both" },
  ],
};

/** Form state keeps list and number fields as the raw text being typed:
 * parsing on every keystroke eats the comma you just typed, so a second
 * technology could only ever be pasted in. */
type FormState = {
  kind: Kind;
  role: string;
  company: string;
  stack: string;
  compMin: string;
  compMax: string;
  compCurrency: string;
  location: string;
  remote: Remote;
  deadline: string;
  seniority: string;
  sourceUrl: string;
  notes: string;
};

const empty: FormState = {
  kind: "job", role: "", company: "", stack: "", compMin: "", compMax: "", compCurrency: "INR",
  location: "", remote: "unclear", deadline: "", seniority: "", sourceUrl: "", notes: "",
};

const orNull = (s: string) => s.trim() || null;
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function toInput(f: FormState): ManualPostingInput {
  return {
    kind: f.kind,
    role: f.role,
    company: f.company,
    stack: f.stack.split(",").map((s) => s.trim()).filter(Boolean),
    compMin: num(f.compMin),
    // A hackathon has one prize figure, not a range.
    compMax: f.kind === "hackathon" ? num(f.compMin) : num(f.compMax),
    compCurrency: orNull(f.compCurrency),
    location: orNull(f.location),
    remote: f.remote,
    deadline: orNull(f.deadline),
    seniority: f.kind === "hackathon" ? null : orNull(f.seniority),
    sourceUrl: orNull(f.sourceUrl),
    notes: orNull(f.notes),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-extrabold uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

/** For postings you'd rather type than paste — a referral, something a friend
 * mentioned, anything with no page to copy from. Same tables, same rubric. */
export function ManualPostingForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(empty);
  const [isPending, startTransition] = useTransition();
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const hackathon = form.kind === "hackathon";

  function submit() {
    if (!form.company.trim() && !form.role.trim()) {
      toast.push({ message: "Give it at least a name or a company.", tone: "danger" });
      return;
    }
    startTransition(async () => {
      const res = await addManualPosting(toInput(form));
      if (!res.ok) { toast.push({ message: res.error, tone: "danger" }); return; }
      setForm(empty);
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-px self-start overflow-hidden rounded border-2 border-border bg-surface">
        {(["job", "hackathon"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ kind: k, remote: "unclear" })}
            className={`px-3 py-1 text-2xs font-extrabold uppercase tracking-wider ${
              form.kind === k ? "bg-ink text-bg-card" : "bg-bg-card text-ink-muted hover:text-ink"
            }`}
          >
            {k === "job" ? "Job" : "Hackathon"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={hackathon ? "Hackathon name" : "Role"}>
          <input className={inputCls} value={form.role} onChange={(e) => set({ role: e.target.value })} placeholder={hackathon ? "Smart India Hackathon" : "Backend Engineer"} />
        </Field>
        <Field label={hackathon ? "Organiser" : "Company"}>
          <input className={inputCls} value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="Acme" />
        </Field>
      </div>

      <Field label={hackathon ? "Suggested tools" : "Stack"}>
        <input
          className={inputCls}
          value={form.stack}
          onChange={(e) => set({ stack: e.target.value })}
          placeholder="typescript, postgresql, aws"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={hackathon ? "Prize pool" : "Pay from"}>
          <input type="number" inputMode="numeric" min={0} step={1} className={inputCls} value={form.compMin}
            onChange={(e) => set({ compMin: e.target.value })} placeholder={hackathon ? "500000" : "1200000"} />
        </Field>
        {!hackathon && (
          <Field label="Pay to">
            <input type="number" inputMode="numeric" min={0} step={1} className={inputCls} value={form.compMax}
              onChange={(e) => set({ compMax: e.target.value })} placeholder="1800000" />
          </Field>
        )}
        <Field label="Currency">
          <input className={inputCls} value={form.compCurrency} onChange={(e) => set({ compCurrency: e.target.value })} placeholder="INR" />
        </Field>
        <Field label={hackathon ? "Submit by" : "Deadline"}>
          <input type="date" className={inputCls} value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${hackathon ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <Field label="Location">
          <input className={inputCls} value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Bengaluru" />
        </Field>
        <Field label={hackathon ? "Format" : "Work setup"}>
          <select className={inputCls} value={form.remote} onChange={(e) => set({ remote: e.target.value as Remote })}>
            {REMOTE[form.kind].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {!hackathon && (
          <Field label="Level">
            <input className={inputCls} value={form.seniority} onChange={(e) => set({ seniority: e.target.value })} placeholder="mid" />
          </Field>
        )}
      </div>

      <Field label="Link">
        <input type="url" className={inputCls} value={form.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://…" />
      </Field>

      <Field label="Notes">
        <textarea rows={2} className={`resize-none ${inputCls}`} value={form.notes}
          onChange={(e) => set({ notes: e.target.value })} placeholder="Referral from Priya — team builds the payments API." />
      </Field>

      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={isPending}
          className="rounded border-2 border-border bg-primary px-4 py-2 text-sm font-bold text-white shadow-hard-1 btn-push disabled:opacity-50">
          {isPending ? "Adding…" : "Add posting"}
        </button>
        <button onClick={onCancel} className="px-3 py-2 text-xs font-bold text-ink-muted hover:text-ink">Cancel</button>
      </div>
    </div>
  );
}
