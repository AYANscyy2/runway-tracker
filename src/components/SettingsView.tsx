import { useSession, signOut } from "@/lib/auth-client";

export function SettingsView({
  theme,
  setTheme,
}: {
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}) {
  const { data: session } = useSession();

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-ink">Settings</h2>

      <div className="space-y-6">
        {/* Appearance Section */}
        <section className="rounded border-2 border-border bg-bg-card p-6 shadow-hard-1">
          <h3 className="mb-4 text-lg font-bold text-ink">Appearance</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-ink">Theme</p>
              <p className="text-sm text-ink-muted">Choose your preferred visual style.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme("light")}
                className={`rounded border-2 border-border px-4 py-2 text-sm font-extrabold uppercase tracking-wider transition-colors ${
                  theme === "light"
                    ? "bg-primary text-white shadow-hard-1"
                    : "bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`rounded border-2 border-border px-4 py-2 text-sm font-extrabold uppercase tracking-wider transition-colors ${
                  theme === "dark"
                    ? "bg-primary text-white shadow-hard-1"
                    : "bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                Dark
              </button>
            </div>
          </div>
        </section>

        {/* Account Section */}
        <section className="rounded border-2 border-border bg-bg-card p-6 shadow-hard-1">
          <h3 className="mb-4 text-lg font-bold text-ink">Account</h3>
          {session?.user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {session.user.image && (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="h-12 w-12 rounded-full border-2 border-border"
                  />
                )}
                <div>
                  <p className="font-bold text-ink">{session.user.name}</p>
                  <p className="text-sm text-ink-muted">{session.user.email}</p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="rounded border-2 border-border bg-tertiary px-4 py-2 text-sm font-extrabold uppercase tracking-wider text-ink shadow-hard-1 transition-colors hover:brightness-95"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="text-sm text-ink-muted">
              You are not signed in. Use the button in the top right to sign in and sync your data.
            </div>
          )}
        </section>
        
        {/* About Section */}
        <section className="rounded border-2 border-border bg-bg-card p-6 shadow-hard-1">
          <h3 className="mb-4 text-lg font-bold text-ink">About</h3>
          <p className="text-sm text-ink-muted mb-2">
            Runway is your central hub for tracking opportunities, hackathons, and job applications.
          </p>
          <p className="text-sm font-bold text-ink">Version 1.0.0</p>
        </section>
      </div>
    </div>
  );
}
