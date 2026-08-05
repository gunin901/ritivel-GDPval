"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type User = {
  id: string;
  display_name: string;
  email: string;
  passkey: string;
  is_admin: number;
  active: number;
};

export default function ParticipantsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<User | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/participants")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed");
        setUsers(data as User[]);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        display_name: name || undefined,
        is_admin: makeAdmin,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Create failed");
      return;
    }
    setCreated(data as User);
    setEmail("");
    setName("");
    setMakeAdmin(false);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/admin/participants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    load();
  }

  async function regen(id: string) {
    const res = await fetch("/api/admin/participants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "regenerate_passkey" }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreated({ ...(users.find((u) => u.id === id) as User), passkey: data.passkey });
      load();
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-violet-950">Users</h1>
        <p className="mt-1 text-violet-700">
          Create graders with email + auto passkey. Toggle admin as needed.
        </p>
      </div>

      <form
        onSubmit={onCreate}
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2"
      >
        <label className="text-sm font-semibold">
          Email
          <input
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Display name
          <input
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={(e) => setMakeAdmin(e.target.checked)}
          />
          Make admin
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white sm:justify-self-end"
        >
          Add user
        </button>
      </form>

      {created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          Created <strong>{created.email}</strong> — passkey{" "}
          <code className="font-mono">{created.passkey}</code>
        </div>
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Passkey</th>
              <th className="py-2 pr-3">Admin</th>
              <th className="py-2 pr-3">Active</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)]">
                <td className="py-2 pr-3 font-semibold">{u.display_name}</td>
                <td className="py-2 pr-3">{u.email}</td>
                <td className="py-2 pr-3 font-mono text-xs">{u.passkey}</td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => patch(u.id, { is_admin: !u.is_admin })}
                  >
                    {u.is_admin ? "Yes" : "No"}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => patch(u.id, { active: !u.active })}
                  >
                    {u.active ? "Yes" : "No"}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="text-[var(--accent)] underline"
                    onClick={() => regen(u.id)}
                  >
                    Regenerate passkey
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
