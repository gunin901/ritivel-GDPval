"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/grade/instructions", label: "Instructions" },
  { href: "/grade", label: "Queue" },
  { href: "/grade/tags", label: "Tag guide" },
];

function isActive(href: string, pathname: string) {
  if (href === "/grade/instructions") {
    return pathname.startsWith("/grade/instructions");
  }
  if (href === "/grade/tags") {
    return pathname.startsWith("/grade/tags");
  }
  // Queue covers /grade and comparison/reference routes
  return (
    pathname === "/grade" ||
    (pathname.startsWith("/grade/") &&
      !pathname.startsWith("/grade/instructions") &&
      !pathname.startsWith("/grade/tags"))
  );
}

export function GradeNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active = isActive(l.href, pathname);
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
