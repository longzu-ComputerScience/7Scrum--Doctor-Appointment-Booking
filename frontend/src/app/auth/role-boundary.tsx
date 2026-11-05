"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { apiMessage } from "@/lib/contract-api";
import type { Role } from "@/lib/fe1-api";
import styles from "./auth.module.css";
export function RoleBoundary({ role, children }: { role: Role; children: React.ReactNode }) {
  const { state, reload } = useAuth();
  const pathname = usePathname();
  if (state.status === "ready" && state.identity.role === role) return children;
  return <main style={{ maxWidth: 620, margin: "70px auto", padding: 24 }}>
    <Link className={styles.brand} href="/">carely.</Link>
    {state.status === "loading" ? <p role="status">Loading your account…</p> : state.status === "error" ?
      <div className={styles.alert} role="alert"><p>{apiMessage(state.error)}</p><button onClick={reload}>Try again</button></div> :
      <><h1>{state.status === "ready" ? `This area is for ${role}s.` : "Sign in to continue."}</h1>
        <p>{state.status === "ready" ? `Your ${state.identity.role} account cannot access this portal.` : `Use your ${role} account to view this page.`}</p></>}
    {state.status !== "loading" && <Link className={styles.primary} href={`/${role}/login?next=${encodeURIComponent(pathname)}`}>Open {role} sign in</Link>}
    <p><Link className={styles.back} href="/">Back to Carely</Link></p>
  </main>;
}
