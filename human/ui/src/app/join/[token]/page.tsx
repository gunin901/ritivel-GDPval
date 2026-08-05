"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Invite links retired — redirect to email + passkey login. */
export default function JoinRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-violet-700">
        Invite links are retired — use email + passkey at login.
      </p>
    </main>
  );
}
