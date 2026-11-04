"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ScheduleManager } from "./schedule-manager";
import { AppointmentList } from "./appointment-list";
import { StaffIcon } from "./staff-icon";
import styles from "./staff.module.css";

export default function StaffPage() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [session, setSession] = useState<{ token: string; email: string } | null>(null);
  const [ready, setReady] = useState(!client);
  const [preview, setPreview] = useState(!client);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [tab, setTab] = useState("appointments");

  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data } = client.auth.onAuthStateChange((_event, current) => {
      if (!active) return;
      setSession(current ? { token: current.access_token, email: current.user.email || "Staff" } : null);
      if (current) setPreview(false);
      setReady(true);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      setSession(data.session ? { token: data.session.access_token, email: data.session.user.email || "Staff" } : null);
      setReady(true);
    }).catch(() => { if (active) { setReady(true); setError("Unable to restore your session. Please sign in again."); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword(""); setPreview(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (!client || busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setSession(null); setPreview(false); setTab("appointments");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign out."); }
    finally { setBusy(false); }
  }

  return <div className={`dashboard-shell ${navigationOpen ? "sidebar-expanded" : "sidebar-collapsed"}`}>
    <aside className="dashboard-sidebar" aria-label="Staff navigation">
      <div className="sidebar-top">
        <Link href="/" className="carely-logo"><span className="logo-mark" /><span>carely.</span></Link>
        <div className="sidebar-nav">
          {([['appointments', 'Appointments', 'calendar'], ['schedule', 'Doctor schedules', 'clock']] as const).map(([key, label, icon]) => <button key={key} className={`sidebar-nav-item ${tab === key ? "active" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setNavigationOpen(false); }}><StaffIcon name={icon} /><span>{label}</span></button>)}
        </div>
      </div>
      <div className="sidebar-bottom"><Link className="sidebar-nav-item" href="/"><StaffIcon name="home" /><span>Patient portal</span></Link>{session && <button className="sidebar-nav-item" disabled={busy} onClick={logout}><StaffIcon name="logout" /><span>Log out</span></button>}<button className="sidebar-toggle" onClick={() => setNavigationOpen(false)} aria-label="Close navigation">‹</button></div>
    </aside>
    {navigationOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <main className="dashboard-content">
      <button className="menu-button" aria-label="Toggle navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(!navigationOpen)}><StaffIcon name="menu" /></button>
      <header className={`dashboard-header ${styles.header}`}><div><span className="header-eyebrow">STAFF PORTAL</span><h1>{tab === "appointments" ? "Appointments" : "Doctor schedules"}</h1></div><div className={styles.identity}><span className={styles.avatar}><StaffIcon name="user" /></span><div><small>Welcome back,</small><strong>{session?.email || "Carely staff"}</strong></div></div></header>
      <div className={styles.page}>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {!ready ? <div className={styles.empty} role="status">Loading your workspace…</div> : !session && !preview ? <section className={styles.login}>
          <span className={styles.featureIcon}><StaffIcon name="calendar" /></span><p className={styles.eyebrow}>CARE STARTS HERE</p><h2>Your clinic, connected.</h2><p>Sign in to manage appointments and keep every visit on track.</p>
          <form onSubmit={login}><label>Email address<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className={styles.primary} disabled={busy}>{busy ? "Signing in…" : "Sign in to workspace"}<StaffIcon name="arrow" /></button></form>
          <button className={styles.textButton} onClick={() => { setPreview(true); setError(""); }}>Explore with sample appointments</button>
        </section> : <>
          {preview && <div className={styles.preview}><span><strong>Preview workspace</strong> · Sample appointments only. Changes are not saved.</span>{client && <button onClick={() => { setPreview(false); setTab("appointments"); }}>Staff sign in ↗</button>}</div>}
          {tab === "appointments" ? <AppointmentList key={session?.email || "preview"} token={session?.token || ""} preview={preview} /> : preview ? <section className={styles.empty}><StaffIcon name="clock" /><h2>Doctor schedules</h2><p>Sign in with a staff account to manage your clinic’s available time slots.</p><button className={styles.secondary} onClick={() => setTab("appointments")}>Back to appointments</button></section> : <ScheduleManager token={session!.token} />}
        </>}
        <footer className={styles.footer}><span className="carely-logo"><span className="logo-mark" />carely.</span><span>A little more organized. A lot more care.</span><span>Clinic time · UTC+7</span></footer>
      </div>
    </main>
  </div>;
}
