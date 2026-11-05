"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth/auth-provider";
import styles from "./patient-shell.module.css";

type NavigationItem = { key: string; label: string; icon: ReactNode };
type Props = {
  portal?: "patient" | "doctor";
  active: string;
  items: NavigationItem[];
  onNavigate: (key: string) => void;
  onHelp: () => void;
  children: ReactNode;
};

const storageKey = "carely_sidebar_collapsed";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSidebarSnapshot(): boolean {
  try {
    return localStorage.getItem(storageKey) === "true";
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
    localStorage.setItem(storageKey, String(next));
    listeners.forEach((listener) => listener());
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function NavigationIcon({ name }: { name: "menu" | "close" | "help" | "logout" }) {
  const paths = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.1 1-1.9 1.4-1.9 3M12 17h.01" /></>,
    logout: <><path d="m10 17 5-5-5-5M15 12H3" /><path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function PatientShell({ active, items, onNavigate, onHelp, children, portal = "patient" }: Props) {
  const { state, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  async function leave() {
    if (signingOut) return;
    setSigningOut(true); setLogoutError("");
    try { await signOut(); router.replace(`/${portal}/login`); }
    catch { setLogoutError("Could not sign out. Try again."); }
    finally { setSigningOut(false); }
  }
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopCollapsed = useSyncExternalStore(subscribe, getSidebarSnapshot, getServerSnapshot);
  const navigation = useRef<HTMLElement>(null);
  const mobileToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const mobile = window.matchMedia("(max-width: 1023px)");
    const returnFocus = mobileToggle.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(navigation.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? [])
      .filter((element) => element.getClientRects().length > 0);
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

  function navigate(key: string) {
    onNavigate(key);
    setMobileOpen(false);
  }

  return (
    <div className={`dashboard-shell ${styles.shell} ${desktopCollapsed ? styles.compact : ""} ${mobileOpen ? styles.open : ""}`}>
      <aside id="patient-navigation" ref={navigation} className={styles.sidebar}
        role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined} aria-label={`${portal === "doctor" ? "Doctor" : "Patient"} navigation`}>
        <div className={styles.top}>
          <div className={styles.brandRow}>
            <Link href={portal === "doctor" ? "/doctor" : "/"} className={styles.brand} aria-label="Carely home" onClick={() => navigate("overview")}>
              <span className={styles.logoMark} aria-hidden="true" /><span className={styles.brandText}>carely.</span>
            </Link>
            <button className={styles.mobileClose} onClick={() => setMobileOpen(false)} aria-label="Close navigation"><NavigationIcon name="close" /></button>
          </div>
          <nav className={styles.links} aria-label={`${portal === "doctor" ? "Doctor" : "Patient"} sections`}>
            {items.map((item) => (
              <button key={item.key} className={`${styles.item} ${active === item.key ? styles.active : ""}`}
                aria-label={item.label} aria-current={active === item.key ? "page" : undefined} onClick={() => navigate(item.key)}>
                {item.icon}<span className={styles.label} aria-hidden="true">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className={styles.bottom}>
          <button className={styles.item} aria-label="Help" onClick={() => { setMobileOpen(false); onHelp(); }}>
            <NavigationIcon name="help" /><span className={styles.label} aria-hidden="true">Help</span>
          </button>
          {state.status === "ready" || state.status === "error" ? <button className={styles.item} aria-label="Log out" disabled={signingOut} onClick={() => void leave()}><NavigationIcon name="logout" /><span className={styles.label} aria-hidden="true">{signingOut ? "Signing out…" : "Log out"}</span></button>
            : <Link className={styles.item} href={`/${portal}/login`} aria-label="Sign in"><NavigationIcon name="logout" /><span className={styles.label}>Sign in</span></Link>}
          {logoutError && <p role="alert">{logoutError}</p>}
          <button className={styles.desktopToggle} onClick={toggleSidebarCollapsed}
            aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!desktopCollapsed} aria-controls="patient-navigation">
            <svg className={`${styles.chevron} ${desktopCollapsed ? styles.chevronCollapsed : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
      </aside>
      {mobileOpen && <button className={styles.backdrop} onClick={() => setMobileOpen(false)} aria-label="Close navigation backdrop" tabIndex={-1} />}
      <main className={`dashboard-content ${styles.content}`} inert={mobileOpen}>
        <button ref={mobileToggle} className={styles.mobileToggle} onClick={() => setMobileOpen(true)}
          aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="patient-navigation" aria-haspopup="dialog"><NavigationIcon name="menu" /></button>
        {children}
      </main>
    </div>
  );
}
