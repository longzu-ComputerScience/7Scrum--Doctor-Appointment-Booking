"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./auth/auth-provider";
import { PatientProfileView } from "./patient/profile/patient-profile";
import { PatientShell } from "./patient-shell";
import { DoctorBrowser } from "./doctor-browser";
import { Consultation } from "./consultation";
import { PatientAppointmentsView } from "./patient/patient-appointments";
import { useAvatarPreview } from "./profile/avatar-preview";
import { doctorBookingHref } from "@/lib/specialty-handoff";
import styles from "./patient-shell.module.css";
import homeStyles from "./home.module.css";

type IconName = "menu" | "home" | "calendar" | "appointments" | "profile" | "help" | "communication" | "logout" | "search" | "bell" | "settings" | "arrow" | "check" | "close";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    home: <><path d="m4 10 8-6 8 6v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9 20v-6h6v6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    appointments: <><path d="M8 3h8M8 7h8M8 12h8M8 17h5"/><rect x="5" y="3" width="14" height="18" rx="2"/></>,
    profile: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.6-4 3-6 7-6s6.4 2 7 6"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.1 1-1.9 1.4-1.9 3M12 17h.01"/></>,
    communication: <><path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 3v-3.5A3.5 3.5 0 0 1 5 10.5z"/><path d="M9 8h6M9 11h4"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h.1A1.6 1.6 0 0 0 9 4.2V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z"/></>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7"/></>,
    check: <path d="m5 12 4 4 10-10"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg className="dash-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const navItems = [
  { key: "overview", label: "Overview", icon: "home" as IconName },
  { key: "book", label: "Book appointment", icon: "calendar" as IconName },
  { key: "appointments", label: "My appointments", icon: "appointments" as IconName },
  { key: "profile", label: "My profile", icon: "profile" as IconName },
];

export default function HomePage() {
  const router = useRouter();
  const { state: auth } = useAuth();
  const { avatarFor } = useAvatarPreview();
  const accountName = auth.status === "ready" ? (auth.identity.role === "patient" ? auth.identity.patient.name : auth.identity.doctor.name) : "Guest Patient";
  const [active, setActive] = useState("overview");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (auth.status === "ready" && auth.identity.role === "doctor") router.replace("/doctor");
  }, [auth, router]);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (navItems.some((item) => item.key === hash)) {
        setActive(hash);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleNavigate = (key: string) => {
    setActive(key);
    if (typeof window !== "undefined" && window.location.hash.replace("#", "") !== key) {
      // Keep Next's history tree in sync so intercepted booking routes can
      // close and reopen after a first-visit Dashboard section change.
      router.push(`/#${key}`, { scroll: false });
    }
  };

  const activeLabel = navItems.find((item) => item.key === active)?.label || "Overview";
  const isPatient = auth.status === "ready" && auth.identity.role === "patient";
  const exploreSpecialty = (specialty: string) => {
    if (isPatient) {
      setSearch(specialty);
      setChatOpen(false);
      handleNavigate("book");
    } else {
      router.push("/patient/login?next=%2F%23book");
    }
  };
  const chooseConsultationDoctor = (doctorId: string, specialty: string, demoMode: boolean) => {
    const href = doctorBookingHref(doctorId, specialty);
    setChatOpen(false);
    if (isPatient || demoMode) {
      // Sample slots are viewable without login; BookingClient disables demo confirmation.
      router.push(href, { scroll: false });
    } else {
      router.push("/patient/login?next=" + encodeURIComponent(href));
    }
  };
  const consultationPanel = <ConsultationPanel open={chatOpen} onClose={() => setChatOpen(false)}
    onExploreSpecialty={exploreSpecialty} onChooseDoctor={chooseConsultationDoctor}
    canExploreDoctors={isPatient} />;

  if (auth.status === "loading" || (auth.status === "ready" && auth.identity.role === "doctor")) {
    return <main className={homeStyles.guest}><p className={homeStyles.loading} role="status">Opening your care portal…</p></main>;
  }
  if (auth.status !== "ready") {
    return <main className={homeStyles.guest}>
      <header className={homeStyles.guestHeader}><Link href="/" className={styles.brand} aria-label="Carely home"><span className={styles.logoMark} aria-hidden="true" /><span className={styles.brandText}>carely.</span></Link>
        <div className={homeStyles.guestActions}><Link href="/doctor/login">Doctor portal</Link><Link href="/patient/login">Sign in</Link><Link className={homeStyles.getStarted} href="/patient/register">Get started</Link></div>
      </header>
      <div className={homeStyles.overviewLabel}><span className="header-eyebrow">WELCOME TO CARELY</span><h1>Overview</h1></div>
      <Overview onBook={() => router.push("/patient/login?next=%2F%23book")} onChat={() => setChatOpen(true)} />
      <footer className="dashboard-footer"><span><b>carely.</b> Thoughtful care, made simple.</span><span>Your health, at your pace.</span></footer>
      {consultationPanel}
    </main>;
  }

  const patientAvatar = auth.identity.role === "patient" ? avatarFor(auth.identity.patient.id) : null;
  return <PatientShell active={active} items={navItems.map((item) => ({ ...item, icon: <Icon name={item.icon} /> }))} onNavigate={handleNavigate} onHelp={() => setChatOpen(true)}>
      <header className="dashboard-header"><div className="header-title"><span className="header-eyebrow">PATIENT PORTAL</span><h1>{activeLabel}</h1></div><div className="header-actions"><div className={`compact-search ${searchOpen ? "expanded" : ""}`}>{searchOpen && <input autoFocus value={search} onChange={(e) => { setSearch(e.target.value); handleNavigate("book"); }} placeholder="Search doctors or specialties..." aria-label="Search" />}<button onClick={() => setSearchOpen((value) => !value)} aria-label="Open search"><Icon name="search" /></button></div>{auth.status === "ready" && auth.identity.role === "doctor" ? <Link className="text-button" href="/doctor">Doctor dashboard</Link> : auth.status !== "ready" && <Link className="text-button" href="/patient/login">Sign in</Link>}<button className="header-icon-button" aria-label="My profile" onClick={() => handleNavigate("profile")}
      style={patientAvatar ? {
        backgroundImage: "url(" + JSON.stringify(patientAvatar) + ")",
        backgroundPosition: "center", backgroundSize: "cover"
      } : undefined}>{patientAvatar ? null : <Icon name="profile" />}</button><div className="header-greeting"><span>Hello,</span><strong>{accountName} <span className="greeting-wave">✳</span></strong></div></div></header>
      {active === "overview" ? (
        <Overview onBook={() => handleNavigate("book")} onChat={() => setChatOpen(true)} />
      ) : active === "book" ? (
        <DoctorBrowser query={search} />
      ) : active === "appointments" ? (
        <PatientAppointmentsView />
      ) : (
        <PatientProfileView />
      )}
      <footer className="dashboard-footer"><span><b>carely.</b> Thoughtful care, made simple.</span><Link href="/doctor/login">Doctor portal</Link></footer>
    {consultationPanel}
    <button className="chat-fab" onClick={() => setChatOpen((value) => !value)} aria-label={chatOpen ? "Close chat" : "Open chat"}><Icon name={chatOpen ? "close" : "communication"} /></button>
  </PatientShell>;
}

function ConsultationPanel({ open, onClose, onExploreSpecialty, onChooseDoctor, canExploreDoctors }: {
  open: boolean; onClose: () => void; onExploreSpecialty: (specialty: string) => void;
  onChooseDoctor: (doctorId: string, specialty: string, demoMode: boolean) => void;
  canExploreDoctors: boolean;
}) {
  return <><button type="button" className={homeStyles.consultBackdrop} onClick={onClose} aria-label="Close consultation" hidden={!open} />
    <div className={homeStyles.consultPanel} role="dialog" aria-modal="true" aria-label="Chat with Carely" hidden={!open}>
    <div className={homeStyles.consultTop}><strong>Carely consultation</strong><button type="button" onClick={onClose} aria-label="Close chat"><Icon name="close" /></button></div>
    <Consultation onExploreSpecialty={onExploreSpecialty}
      onChooseDoctor={onChooseDoctor} canExploreDoctors={canExploreDoctors} />
  </div></>;
}

function Overview({ onBook, onChat }: { onBook: () => void; onChat: () => void }) {
  const moments = ["Right when you need it.", "On your own schedule.", "With the right specialist."] as const;
  const [moment, setMoment] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setMoment(index => (index + 1) % 3), 4800);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="overview-page"><section className="overview-hero"><div className="hero-copy"><span className="hero-kicker">✦ YOUR HEALTH, SIMPLIFIED</span><h3>Expert care.<br /><em className="hero-animated-line" key={moment}>{moments[moment]}</em></h3><p>From finding the right specialist to booking your visit, we make healthcare feel effortless.</p><div className="hero-actions"><button className="primary-button" onClick={onBook}>Book an appointment </button><button className="text-button" onClick={onChat}>Chat with Carely </button></div><div className="hero-assurance"><span><Icon name="check" /></span> Easy booking <i /> <span><Icon name="check" /></span> Trusted specialists</div></div><div className="hero-visual" aria-hidden="true"><div className="hero-disc" /><div className="hero-spark">✳</div><div className="hero-cross">+</div><svg className="hero-doctor-svg" viewBox="0 0 570 540"><circle cx="288" cy="264" r="236" fill="#b8d0ff" opacity=".48"/><circle cx="328" cy="278" r="190" fill="#90b4ff" opacity=".22"/><path d="M217 151C184 117 190 68 232 51c32-25 96-14 114 31 15 36-6 60-2 94l-33 27h-84Z" fill="#293c64"/><ellipse cx="280" cy="132" rx="74" ry="83" fill="#e8b493"/><path d="M204 115c-7-54 36-78 87-73 38 3 58 34 63 72-29-2-44-26-59-39-29 36-56 39-91 40Z" fill="#293c64"/><path d="M230 132q14-10 29 0m38 0q14-10 29 0M253 170q26 19 54 0" stroke="#30394f" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M252 202v41l31 32 31-32v-41" fill="#dda585"/><path d="M220 230c-60 20-78 58-104 149L78 540h406l-39-161c-20-95-52-133-112-147l-46 52-45-41Z" fill="url(#coat)"/><path d="M242 243l44 41 47-52 18 308H217Z" fill="#b6c8e8"/><path d="M204 292q-18 96 41 123q49 20 74-29" stroke="#5078bb" fill="none" strokeWidth="11" strokeLinecap="round"/><circle cx="320" cy="384" r="24" fill="#426db8"/><circle cx="320" cy="384" r="12" fill="#e7f0ff"/><rect x="202" y="375" width="158" height="101" rx="15" fill="#fff" stroke="#c6daf7" strokeWidth="4"/><rect x="226" y="392" width="66" height="10" rx="5" fill="#94b7eb"/><rect x="226" y="411" width="104" height="8" rx="4" fill="#dce8f8"/><rect x="226" y="429" width="88" height="8" rx="4" fill="#dce8f8"/><circle cx="331" cy="445" r="12" fill="#2cae93"/><path d="m325 445 4 4 8-9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round"/></svg><div className="hero-float rating-float"><b>★</b><span><strong>Find your specialist</strong><small>Explore care with confidence</small></span></div><div className="hero-float visit-float"><b><Icon name="check" /></b><span><strong>Appointment ready</strong><small>Find a time that suits you</small></span></div></div></section>
    <section className="care-steps" aria-labelledby="care-steps-title">
      <div className="care-steps-heading"><span className="header-eyebrow">CARE THAT FITS</span>
        <h2 id="care-steps-title">Your path to better care.</h2>
        <p>Three simple moments, one connected experience.</p></div>
      <div className="care-steps-grid">
        <article><span className="care-step-number">01</span><h3>Find your specialist</h3><p>Explore doctor profiles, specialties and availability.</p></article>
        <article><span className="care-step-number">02</span><h3>Pick a time</h3><p>See current 30-minute slots and choose what works.</p></article>
        <article><span className="care-step-number">03</span><h3>Stay on track</h3><p>Keep booking details together in My appointments.</p></article>
      </div></section></div>;
}
