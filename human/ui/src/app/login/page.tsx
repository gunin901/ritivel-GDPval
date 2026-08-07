"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, passkey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.replace(data.isAdmin ? "/admin" : "/grade/instructions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-[1.75rem] border border-[var(--border)] bg-white p-8 shadow-[0_20px_60px_-28px_rgba(76,29,149,0.35)]"
      >
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          GDPval
        </p>
        <h1 className="mt-2 text-3xl font-bold text-violet-950">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Use the email and passkey from your admin.
        </p>
        <label className="mt-6 block text-sm font-semibold text-violet-900">
          Email
          <input
            className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none focus:border-[var(--accent)]"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-violet-900">
          Passkey
          <input
            className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none focus:border-[var(--accent)]"
            type="password"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
