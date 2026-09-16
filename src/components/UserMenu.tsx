"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";

export function UserMenu({
  theme,
  onToggleTheme,
  onOpenSettings,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const user = session?.user;
  const initial = (user?.name ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user?.name ?? "Account"}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-bg-card text-sm font-extrabold text-ink shadow-hard-1 btn-push-sm"
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-52 rounded border-2 border-border bg-bg-card p-1 shadow-hard-2"
        >
          {user && (
            <div className="border-b-2 border-border/20 px-3 py-2">
              <p className="truncate text-sm font-bold text-ink">{user.name}</p>
              <p className="truncate text-2xs text-ink-muted">{user.email}</p>
            </div>
          )}
          <MenuItem onClick={() => { onToggleTheme(); setOpen(false); }}>
            {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </MenuItem>
          <MenuItem onClick={() => { onOpenSettings(); setOpen(false); }}>Settings</MenuItem>
          <MenuItem onClick={() => signOut()} danger>Sign out</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full rounded px-3 py-2 text-left text-sm font-bold hover:bg-surface-2 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
