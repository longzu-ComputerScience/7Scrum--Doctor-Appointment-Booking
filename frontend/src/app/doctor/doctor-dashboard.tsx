"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { createClient, type Session } from "@supabase/supabase-js";
import { apiMessage, ContractApiError } from "../../lib/contract-api";
import { formatScheduleDay, formatScheduleTime } from "../../lib/schedule-time";
import { getDoctorProfile, listDoctorAppointments, upcomingAppointments, type DoctorAppointment, type DoctorProfile } from "./doctor-api";
import { DoctorIcon, type DoctorIconName } from "./doctor-icons";
import { DoctorScheduleEditor } from "./doctor-schedule-editor";
import styles from "./doctor-dashboard.module.css";

const sidebarStorageKey = "carely_doctor_sidebar_collapsed";
const listeners = new Set<() => void>();

function subscribeSidebar(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSidebarSnapshot(): boolean {
  try {
    return localStorage.getItem(sidebarStorageKey) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

function toggleSidebarCollapsed() {
  try {
    const next = !getSidebarSnapshot();
    localStorage.setItem(sidebarStorageKey, String(next));
    listeners.forEach((listener) => listener());
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

type NavKey = "overview" | "appointments" | "schedule";

const navItems: { key: NavKey; label: string; icon: DoctorIconName }[] = [
  { key: "overview", label: "Overview", icon: "overview" },
  { key: "appointments", label: "Appointments", icon: "appointments" },
  { key: "schedule", label: "Working Schedule", icon: "schedule" },
];

// Supabase owns session persistence and refresh. No URL or manually supplied tokens.
export function DoctorDashboard() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(Boolean(client));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!client) return;
    // INITIAL_SESSION restores the SDK session; later events include refresh and sign-out.
    const { data } = client.auth.onAuthStateChange((_event, current) => {
      setSession(current);
      setRestoring(false);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  async function login(email: string, password: string) {
    if (!client || authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) setAuthError("Unable to sign in. Check your email and password and try again.");
    } catch {
      setAuthError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    // Unmount protected content immediately, including pending schedule reads/writes.
    setSession(null);
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await client?.auth.signOut({ scope: "local" });
      if (result?.error) setAuthError("Sign-out could not finish. Please try again.");
    } catch {
      setAuthError("Sign-out could not finish. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  return <DoctorWorkspace key={session?.access_token || "signed-out"}
    session={session} restoring={restoring} configured={Boolean(client)}
    authBusy={authBusy} authError={authError} onLogin={login} handleSignOut={signOut} />;
}

function DoctorWorkspace({ session, restoring, configured, authBusy, authError, onLogin, handleSignOut }: {
  session: Session | null; restoring: boolean; configured: boolean; authBusy: boolean; authError: string;
  onLogin: (email: string, password: string) => Promise<void>; handleSignOut: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<NavKey>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopCollapsed = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, getServerSnapshot);
  const navigationRef = useRef<HTMLElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const token = session?.access_token || "";
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState("");
  // A Supabase session alone does not authorize a Patient as a Doctor.
  const authenticated = Boolean(token && doctorProfile && !profileError && !accessError);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1) as NavKey;
      // Editor validation links use their own fragment; keep the editor mounted.
      if (navItems.some(item => item.key === hash)) setActiveTab(hash);
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    getDoctorProfile(token, controller.signal).then(profile => {
      if (!controller.signal.aborted) setDoctorProfile(profile);
    }).catch(error => {
      if (!controller.signal.aborted) setProfileError(apiMessage(error));
    });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    listDoctorAppointments(token, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setAppointments(data);
      setAppointmentsLoading(false);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setAppointments([]);
      setAppointmentsLoading(false);
      setAppointmentsError(apiMessage(error));
      if (error instanceof ContractApiError && (error.status === 401 || error.status === 403)) {
        setDoctorProfile(null);
        setAccessError(apiMessage(error));
      }
    });
    return () => controller.abort();
  }, [token, authenticated]);

  // Mobile Drawer keyboard trap & overflow
  useEffect(() => {
    if (!mobileOpen) return;
    const mobile = window.matchMedia("(max-width: 1023px)");
    const returnFocus = mobileToggleRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(navigationRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? []).filter(
        (element) => element.getClientRects().length > 0
      );
    focusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    function onBreakpointChange() {
      if (!mobile.matches) setMobileOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    mobile.addEventListener("change", onBreakpointChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      mobile.removeEventListener("change", onBreakpointChange);
      if (mobile.matches) returnFocus?.focus();
    };
  }, [mobileOpen]);

  function handleNavigate(key: NavKey) {
    setActiveTab(key);
    setMobileOpen(false);
    if (typeof window !== "undefined" && window.location.hash.replace("#", "") !== key) {
      window.location.hash = key;
    }
  }

  const activeLabel = navItems.find(item => item.key === activeTab)?.label || "Overview";
  const avatarInitials = authenticated && doctorProfile
    ? doctorProfile.name.replace(/^Dr\.\s*|^BS\.\s*/i, "").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()
    : "";
  const upcoming = upcomingAppointments(appointments);

  return (
    <div
      className={`dashboard-shell ${styles.shell} ${desktopCollapsed ? styles.compact : ""} ${
        mobileOpen ? styles.open : ""
      }`}
    >
      {/* Left Sidebar */}
      <aside
        id="doctor-navigation"
        ref={navigationRef}
        className={styles.sidebar}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label="Doctor navigation"
      >
        <div className={styles.top}>
          <div className={styles.brandRow}>
            <Link href="/doctor" className={styles.brand} aria-label="Carely Doctor Portal" onClick={() => handleNavigate("overview")}>
              <span className={styles.logoMark} aria-hidden="true" />
              <span className={styles.brandText}>carely.</span>
            </Link>
            <button
              className={styles.mobileClose}
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <DoctorIcon name="close" />
            </button>
          </div>

          <nav className={styles.links} aria-label="Doctor sections">
            {navItems.map((item) => (
              <button
                key={item.key}
                className={`${styles.item} ${activeTab === item.key ? styles.active : ""}`}
                aria-label={item.label}
                aria-current={activeTab === item.key ? "page" : undefined}
                onClick={() => handleNavigate(item.key)}
              >
                <DoctorIcon name={item.icon} />
                <span className={styles.label}>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className={styles.bottom}>
          <Link href="/" className={styles.item} aria-label="Go to Patient Portal">
            <DoctorIcon name="home" />
            <span className={styles.label}>Patient Portal</span>
          </Link>
          {session && (
            <button
              className={styles.item}
              aria-label="Log out"
              onClick={handleSignOut}
              disabled={authBusy}
            >
              <DoctorIcon name="logout" />
              <span className={styles.label}>Log out</span>
            </button>
          )}
          <button
            className={styles.desktopToggle}
            onClick={toggleSidebarCollapsed}
            aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!desktopCollapsed}
            aria-controls="doctor-navigation"
          >
            <span className={`${styles.chevron} ${desktopCollapsed ? styles.chevronCollapsed : ""}`}>
              <DoctorIcon name="chevron" />
            </span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          className={styles.backdrop}
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation backdrop"
          tabIndex={-1}
        />
      )}

      {/* Main Content Area */}
      <main className={`dashboard-content ${styles.content}`} inert={mobileOpen}>
        <button
          ref={mobileToggleRef}
          className={styles.mobileToggle}
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="doctor-navigation"
          aria-haspopup="dialog"
        >
          <DoctorIcon name="menu" />
        </button>

        {/* Header: Page Title, Doctor Name, Doctor Avatar */}
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerEyebrow}>DOCTOR PORTAL</span>
            <h1>{activeLabel}</h1>
          </div>

          <div className={styles.headerIdentity}>
            <div className={styles.avatar} aria-label="Doctor profile avatar">
              {avatarInitials ? (
                <span aria-hidden="true">{avatarInitials}</span>
              ) : (
                <DoctorIcon name={authenticated ? "doctor" : "user"} />
              )}
              <span
                className={`${styles.statusDot} ${authenticated ? styles.statusOnline : styles.statusOffline}`}
                title={authenticated ? "Session connected" : "Authentication required"}
                aria-hidden="true"
              />
            </div>
            <div className={styles.doctorInfo}>
              <span className={styles.greetingLabel}>
                {authenticated ? (doctorProfile?.specialty || "Doctor account") : "Doctor Portal"}
              </span>
              <strong className={styles.doctorName}>
                {doctorProfile?.name || (session ? (profileError || accessError ? "Access unavailable" : "Verifying doctor access") : "Not signed in")}
              </strong>
            </div>
          </div>
        </header>

        <div className={styles.pageBody}>
          {!authenticated ? <AuthBlockedCard
            checking={restoring || Boolean(session && !profileError && !accessError)}
            signedIn={Boolean(session)} configured={configured} authBusy={authBusy}
            error={profileError || accessError || authError} onLogin={onLogin} onSignOut={handleSignOut} /> : <>
            {activeTab === "overview" && doctorProfile && <>
              <section className={styles.welcomeHero} aria-labelledby="overview-title">
                <div className={styles.welcomeText}>
                  <span className={styles.badge}><DoctorIcon name="doctor" />Your clinical workspace</span>
                  <h2 id="overview-title" className={styles.welcomeTitle}>Welcome back, {doctorProfile.name}</h2>
                  <p className={styles.welcomeDescription}>Review your upcoming visits and set weekly working hours. All times are shown in Vietnam (UTC+7).</p>
                </div>
                <div className={styles.heroActions}>
                  <button type="button" className={styles.primaryButton} onClick={() => handleNavigate("schedule")}><DoctorIcon name="schedule" />Working Schedule</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => handleNavigate("appointments")}><DoctorIcon name="appointments" />Appointments</button>
                </div>
              </section>
              <div className={styles.statsGrid}>
                <StatCard label="Upcoming visits" value={appointmentsLoading ? "Loading…" : appointmentsError ? "Unavailable" : String(upcoming.length)} note="Future confirmed visits in the loaded appointments" icon="calendar" />
                <StatCard label="Working hours" value="Weekly schedule" note="Review and update your recurring availability" icon="clock" />
                <StatCard label="Your specialty" value={doctorProfile.specialty || "Not provided"} note={doctorProfile.district || "Your doctor profile"} icon="doctor" />
              </div>
              <AppointmentsSection title="Upcoming appointments" appointments={upcoming} loading={appointmentsLoading} error={appointmentsError} />
            </>}
            {activeTab === "appointments" && <AppointmentsSection title="Patient appointments" appointments={appointments} loading={appointmentsLoading} error={appointmentsError} />}
            {activeTab === "schedule" && <section aria-labelledby="schedule-section-title">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>
                  <h2 id="schedule-section-title">Doctor Working Schedule</h2>
                  <p>Set your recurring hours in Vietnam (UTC+7). Changes start on your selected future date and preserve existing appointments.</p>
                </div>
              </div>
              <div className={styles.scheduleDirectWrapper}>
                <DoctorScheduleEditor token={token} />
              </div>
            </section>}
          </>}
        </div>
        <footer className={styles.footer}>
          <span><strong className={styles.footerBrand}>carely.</strong> Thoughtful medical scheduling.</span>
          <span>Vietnam · UTC+7</span>
        </footer>
      </main>
    </div>
  );
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: DoctorIconName }) {
  return <div className={styles.statCard}>
    <div className={styles.statTop}>
      <div className={styles.statMeta}><span className={styles.statLabel}>{label}</span><p className={styles.statValue}>{value}</p></div>
      <div className={styles.statIconBadge}><DoctorIcon name={icon} /></div>
    </div>
    <p className={styles.statNote}>{note}</p>
  </div>;
}

function AppointmentsSection({ title, appointments, loading, error }: {
  title: string; appointments: DoctorAppointment[]; loading: boolean; error: string;
}) {
  return <section className={styles.sectionCard} aria-label={title}>
    <div className={styles.sectionHeader}><div className={styles.sectionHeaderTitle}>
      <h2>{title}</h2><p>Appointments for your doctor account · Vietnam (UTC+7)</p>
    </div></div>
    {loading && <p role="status">Loading appointments…</p>}
    {error && <div className={styles.errorMessage} role="alert">{error}</div>}
    {!loading && !error && (appointments.length === 0 ? <div className={styles.emptyCard}>
      <div className={styles.emptyIconBadge}><DoctorIcon name="calendar" /></div>
      <h3 className={styles.emptyTitle}>No {title.toLowerCase()}</h3>
      <p className={styles.emptyDescription}>Appointments will appear here when available.</p>
    </div> : <div className={styles.tableWrap} role="region" aria-label={title + " table"} tabIndex={0}>
      <table className={styles.dataTable}>
        <caption className={styles.srOnly}>{title}</caption>
        <thead><tr><th scope="col">Date &amp; time</th><th scope="col">Patient name</th><th scope="col">Phone number</th><th scope="col">Status</th></tr></thead>
        <tbody>{appointments.map(appt => <tr key={appt.id}>
          <td><strong>{formatScheduleDay(appt.startAt)}</strong><br />{formatScheduleTime(appt.startAt)}</td>
          <td><strong>{appt.patientName}</strong></td><td>{appt.patientPhone || "—"}</td>
          <td><span className={`${styles.statusBadge} ${appt.status === "confirmed" ? styles.badgeConfirmed : appt.status === "completed" ? styles.badgeCompleted : styles.badgeCancelled}`}>{appt.status}</span></td>
        </tr>)}</tbody>
      </table>
    </div>)}
  </section>;
}

function AuthBlockedCard({ checking, signedIn, configured, authBusy, error, onLogin, onSignOut }: {
  checking: boolean; signedIn: boolean; configured: boolean; authBusy: boolean; error: string;
  onLogin: (email: string, password: string) => Promise<void>; onSignOut: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured || checking || authBusy) return;
    await onLogin(email.trim(), password);
    setPassword("");
  }
  return <section className={styles.blockedContainer} aria-labelledby="doctor-access-title">
    <div className={styles.blockedCard}>
      <div className={styles.blockedIconBadge}><DoctorIcon name="lock" /></div>
      <span className={styles.blockedEyebrow}>Doctor portal</span>
      <h2 id="doctor-access-title" className={styles.blockedTitle}>{checking ? "Checking doctor access…" : signedIn ? "Doctor access unavailable" : "Sign in to your workspace"}</h2>
      <p className={styles.blockedDescription}>Your profile, appointments and working schedule are available only to your authorized doctor account.</p>
      {checking && <p role="status">Verifying your session and doctor permissions…</p>}
      {error && <div className={styles.errorMessage} role="alert">{error}</div>}
      {!checking && signedIn && <div className={styles.heroActions}>
        <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>Retry access check</button>
        <button className={styles.primaryButton} type="button" disabled={authBusy} onClick={onSignOut}>Sign out</button>
      </div>}
      {!checking && !signedIn && <div className={styles.authBox}>
        {!configured && <p className={styles.errorMessage} role="status">Doctor sign-in is currently unavailable. Please contact your clinic administrator.</p>}
        <form onSubmit={submit} aria-busy={authBusy}>
          <div className={styles.formGroup}>
            <label htmlFor="doctor-login-email">Doctor email</label>
            <input id="doctor-login-email" name="email" type="email" className={styles.input} required autoComplete="username"
              placeholder="doctor@carely.vn" value={email} disabled={!configured || authBusy} onChange={event => setEmail(event.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="doctor-login-password">Password</label>
            <input id="doctor-login-password" name="password" type="password" className={styles.input} required autoComplete="current-password"
              value={password} disabled={!configured || authBusy} onChange={event => setPassword(event.target.value)} />
          </div>
          <button type="submit" className={`${styles.primaryButton} ${styles.signInButton}`} disabled={!configured || authBusy}>
            {authBusy ? "Signing in…" : "Sign in to Doctor Dashboard"}
          </button>
        </form>
      </div>}
    </div>
  </section>;
}
