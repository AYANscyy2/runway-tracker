"use client";

import { useState, useTransition } from "react";
import { addManualPosting, type ManualPostingInput } from "@/app/inbox/actions";
import { useToast } from "./Toast";

const inputCls =
  "w-full rounded border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:bg-primary-soft";

const REMOTE: { value: ManualPostingInput["remote"]; label: string }[] = [
  { value: "unclear", label: "Not stated" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

const empty: ManualPostingInput = {
  role: "", company: "", stack: [], compMin: null, compMax: null, compCurrency: "INR",
  location: null, remote: "unclear", deadline: null, seniority: null, sourceUrl: null, notes: null,
};

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
  const [form, setForm] = useState<ManualPostingInput>(empty);
  const [isPending, startTransition] = useTransition();
  const set = (patch: Partial<ManualPostingInput>) => setForm((f) => ({ ...f, ...patch }));

  function submit() {
    if (!form.company.trim() && !form.role.trim()) {
      toast.push({ message: "Give it at least a role or a company.", tone: "danger" });
      return;
    }
    startTransition(async () => {
      const res = await addManualPosting(form);
      if (!res.ok) { toast.push({ message: res.error, tone: "danger" }); return; }
      setForm(empty);
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Role">
          <input className={inputCls} value={form.role} onChange={(e) => set({ role: e.target.value })} placeholder="Backend Engineer" />
        </Field>
        <Field label="Company">
          <input className={inputCls} value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="Acme" />
        </Field>
      </div>

      <Field label="Stack">
        <input
          className={inputCls}
          value={form.stack.join(", ")}
          onChange={(e) => set({ stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="typescript, postgresql, aws"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Pay from">
          <input type="number" inputMode="numeric" className={inputCls} value={form.compMin ?? ""}
            onChange={(e) => set({ compMin: e.target.value ? Number(e.target.value) : null })} placeholder="1200000" />
        </Field>
        <Field label="Pay to">
          <input type="number" inputMode="numeric" className={inputCls} value={form.compMax ?? ""}
            onChange={(e) => set({ compMax: e.target.value ? Number(e.target.value) : null })} placeholder="1800000" />
        </Field>
        <Field label="Currency">
          <input className={inputCls} value={form.compCurrency ?? ""} onChange={(e) => set({ compCurrency: e.target.value })} placeholder="INR" />
        </Field>
        <Field label="Deadline">
          <input type="date" className={inputCls} value={form.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || null })} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Location">
          <input className={inputCls} value={form.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} placeholder="Bengaluru" />
        </Field>
        <Field label="Work setup">
          <select className={inputCls} value={form.remote} onChange={(e) => set({ remote: e.target.value as ManualPostingInput["remote"] })}>
            {REMOTE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <input className={inputCls} value={form.seniority ?? ""} onChange={(e) => set({ seniority: e.target.value || null })} placeholder="mid" />
        </Field>
      </div>

      <Field label="Link">
        <input className={inputCls} value={form.sourceUrl ?? ""} onChange={(e) => set({ sourceUrl: e.target.value || null })} placeholder="https://…" />
      </Field>

      <Field label="Notes">
        <textarea rows={2} className={`resize-none ${inputCls}`} value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })} placeholder="Referral from Priya — team builds the payments API." />
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
