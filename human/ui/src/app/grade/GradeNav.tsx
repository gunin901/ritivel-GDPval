"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/grade", label: "Queue" },
  { href: "/grade/tags", label: "Tag guide" },
];

export function GradeNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active =
          l.href === "/grade"
            ? pathname === "/grade" || pathname.startsWith("/grade/") && !pathname.startsWith("/grade/tags")
            : pathname.startsWith(l.href);
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
