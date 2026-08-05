"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/dashboard", label: "Metrics" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/participants", label: "Users" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {LINKS.map((l) => {
        const active =
          l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              active
                ? "bg-white text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-white hover:text-[var(--accent)]"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
