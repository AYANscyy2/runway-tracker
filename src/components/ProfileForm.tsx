"use client";

import { useEffect, useState, useTransition } from "react";
import { getProfile, saveProfile, type ProfileInput } from "@/app/inbox/actions";
import type { UserProfile } from "@/db/schema";
import { useToast } from "./Toast";

const inputCls =
  "rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft";

const REMOTE_OPTIONS: { value: UserProfile["remotePreference"]; label: string }[] = [
  { value: "unclear", label: "No preference" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const empty: ProfileInput = {
  stack: [], targetCompMin: null, targetCompMax: null, compCurrency: "INR",
  preferredLocations: [], remotePreference: "unclear", availableFrom: null,
  seniority: null, notes: null,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-2xs text-ink-faint">{hint}</span>}
    </label>
  );
}

/** The thing Inbox match scores are computed against. Without it, cards get no
 * badge at all rather than a number with nothing behind it. */
export function ProfileForm() {
  const toast = useToast();
  const [form, setForm] = useState<ProfileInput | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await getProfile();
      if (!res.ok) { toast.push({ message: res.error, tone: "danger" }); setForm(empty); return; }
      const p = res.data;
      setForm(p ? {
        stack: p.stack ?? [],
        targetCompMin: p.targetCompMin,
        targetCompMax: p.targetCompMax,
        compCurrency: p.compCurrency,
        preferredLocations: p.preferredLocations ?? [],
        remotePreference: p.remotePreference,
        availableFrom: p.availableFrom,
        seniority: p.seniority,
        notes: p.notes,
      } : empty);
    })();
  }, [toast]);

  if (!form) return <div className="h-40 animate-pulse rounded border-2 border-border bg-surface-2" />;
  const set = (patch: Partial<ProfileInput>) => setForm((f) => ({ ...f!, ...patch }));

  function save() {
    startTransition(async () => {
      const res = await saveProfile(form!);
      if (!res.ok) { toast.push({ message: res.error, tone: "danger" }); return; }
      toast.push({
        message: res.data > 0 ? `Saved — rescored ${res.data} posting${res.data > 1 ? "s" : ""}` : "Saved",
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Inbox postings are scored against this. Everything is optional — a blank field just scores neutral.
      </p>

      <Field label="Your stack" hint="Comma separated. Used for the overlap score.">
        <input
          className={inputCls}
          value={form.stack.join(", ")}
          onChange={(e) => set({ stack: e.target.value.split(",") })}
          placeholder="typescript, react, node.js, postgresql"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Target pay (min)" hint="Annual, plain number.">
          <input
            type="number" inputMode="numeric" className={inputCls}
            value={form.targetCompMin ?? ""}
            onChange={(e) => set({ targetCompMin: e.target.value ? Number(e.target.value) : null })}
            placeholder="1200000"
          />
        </Field>
        <Field label="Target pay (max)">
          <input
            type="number" inputMode="numeric" className={inputCls}
            value={form.targetCompMax ?? ""}
            onChange={(e) => set({ targetCompMax: e.target.value ? Number(e.target.value) : null })}
            placeholder="1800000"
          />
        </Field>
        <Field label="Currency">
          <input
            className={inputCls} value={form.compCurrency}
            onChange={(e) => set({ compCurrency: e.target.value })}
            placeholder="INR"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Preferred locations" hint="Comma separated.">
          <input
            className={inputCls}
            value={form.preferredLocations.join(", ")}
            onChange={(e) => set({ preferredLocations: e.target.value.split(",") })}
            placeholder="Bengaluru, Hyderabad"
          />
        </Field>
        <Field label="Work setup">
          <select
            className={inputCls}
            value={form.remotePreference}
            onChange={(e) => set({ remotePreference: e.target.value as ProfileInput["remotePreference"] })}
          >
            {REMOTE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Available from">
          <input
            type="date" className={inputCls}
            value={form.availableFrom ?? ""}
            onChange={(e) => set({ availableFrom: e.target.value || null })}
          />
        </Field>
        <Field label="Your level">
          <input
            className={inputCls} value={form.seniority ?? ""}
            onChange={(e) => set({ seniority: e.target.value || null })}
            placeholder="intern / junior / mid"
          />
        </Field>
      </div>

      <Field label="What you're looking for" hint="Free text. This is the only part a model reads, for the fit score.">
        <textarea
          rows={3} className={`resize-none ${inputCls}`}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
          placeholder="Backend-leaning fullstack, product teams, ideally somewhere I'd own a service end to end."
        />
      </Field>

      <div>
        <button
          onClick={save}
          disabled={isPending}
          className="rounded border-2 border-border bg-primary px-5 py-2 text-sm font-bold text-white shadow-hard-1 btn-push disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
