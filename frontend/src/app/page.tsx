"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Doctor } from "@/lib/types";

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
  const [active, setActive] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const activeLabel = navItems.find((item) => item.key === active)?.label || "Overview";

  return <div className={`dashboard-shell ${sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed"}`}>
    <aside className="dashboard-sidebar" aria-label="Patient navigation">
      <div className="sidebar-top"><Link href="/" className="carely-logo" aria-label="Carely home"><span className="logo-mark" /> <span>carely.</span></Link><div className="sidebar-nav">{navItems.map((item) => <button key={item.key} className={`sidebar-nav-item ${active === item.key ? "active" : ""}`} onClick={() => setActive(item.key)} title={item.label}><Icon name={item.icon} /><span>{item.label}</span></button>)}</div></div>
      <div className="sidebar-bottom"><button className="sidebar-nav-item" onClick={() => setChatOpen(true)} title="Help"><Icon name="help" /><span>Help</span></button><button className="sidebar-nav-item" title="Log out"><Icon name="logout" /><span>Log out</span></button><button className="sidebar-toggle" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>{sidebarOpen ? "‹" : "›"}</button></div>
    </aside>
    {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
    <main className="dashboard-content">
      <button className="menu-button" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}><Icon name="menu" /></button>
      <header className="dashboard-header"><div className="header-title"><span className="header-eyebrow">PATIENT PORTAL</span><h1>{activeLabel}</h1></div><div className="header-actions"><div className={`compact-search ${searchOpen ? "expanded" : ""}`}>{searchOpen && <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search doctors or specialties..." aria-label="Search" />}<button onClick={() => setSearchOpen((value) => !value)} aria-label="Open search"><Icon name="search" /></button></div><button className="header-icon-button has-badge" aria-label="Notifications"><Icon name="bell" /></button><button className="header-icon-button" aria-label="Settings"><Icon name="settings" /></button><div className="header-greeting"><span>Hello,</span><strong>Laurie <span className="greeting-wave">✳</span></strong></div></div></header>
      {active === "overview" ? <Overview onBook={() => setActive("book")} onChat={() => setChatOpen(true)} /> : active === "book" ? <BookingView onBack={() => setActive("overview")} /> : <section className="empty-module"><span className="module-icon"><Icon name={navItems.find((item) => item.key === active)?.icon || "home"} /></span><h2>{activeLabel}</h2><p>This area will be completed in the next step.</p></section>}
      <footer className="dashboard-footer"><span><b>carely.</b> Thoughtful care, made simple.</span><span>Patient portal · Demo content</span></footer>
    </main>
    {chatOpen && <div className="chat-panel" role="dialog" aria-label="Chat with Carely"><div className="chat-header"><div><strong>Carely support</strong><span>Usually replies in a few minutes</span></div><button onClick={() => setChatOpen(false)} aria-label="Close chat"><Icon name="close" /></button></div><div className="chat-body"><div className="chat-bubble">Hi Laurie! I can help you find a specialty or book an appointment today.</div></div><form className="chat-form" onSubmit={(e) => e.preventDefault()}><input placeholder="Write a message..." aria-label="Message" /><button aria-label="Send"><Icon name="arrow" /></button></form></div>}
    <button className="chat-fab" onClick={() => setChatOpen((value) => !value)} aria-label={chatOpen ? "Close chat" : "Open chat"}><Icon name={chatOpen ? "close" : "communication"} /></button>
  </div>;
}

function Overview({ onBook, onChat }: { onBook: () => void; onChat: () => void }) {
  return <div className="overview-page"><section className="overview-hero"><div className="hero-copy"><span className="hero-kicker">✦ YOUR HEALTH, SIMPLIFIED</span><h3>Expert care.<br /><em>Right when</em><br />you need it.</h3><p>From finding the right specialist to booking your visit, we make healthcare feel effortless.</p><div className="hero-actions"><button className="primary-button" onClick={onBook}>Book an appointment <Icon name="arrow" /></button><button className="text-button" onClick={onChat}>Chat with Carely <Icon name="arrow" /></button></div><div className="hero-assurance"><span><Icon name="check" /></span> Easy booking <i /> <span><Icon name="check" /></span> Trusted specialists</div></div><div className="hero-visual" aria-hidden="true"><div className="hero-disc" /><div className="hero-spark">✳</div><div className="hero-cross">+</div><svg className="hero-doctor-svg" viewBox="0 0 570 540"><circle cx="288" cy="264" r="236" fill="#b8d0ff" opacity=".48"/><circle cx="328" cy="278" r="190" fill="#90b4ff" opacity=".22"/><path d="M217 151C184 117 190 68 232 51c32-25 96-14 114 31 15 36-6 60-2 94l-33 27h-84Z" fill="#293c64"/><ellipse cx="280" cy="132" rx="74" ry="83" fill="#e8b493"/><path d="M204 115c-7-54 36-78 87-73 38 3 58 34 63 72-29-2-44-26-59-39-29 36-56 39-91 40Z" fill="#293c64"/><path d="M230 132q14-10 29 0m38 0q14-10 29 0M253 170q26 19 54 0" stroke="#30394f" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M252 202v41l31 32 31-32v-41" fill="#dda585"/><path d="M220 230c-60 20-78 58-104 149L78 540h406l-39-161c-20-95-52-133-112-147l-46 52-45-41Z" fill="url(#coat)"/><path d="M242 243l44 41 47-52 18 308H217Z" fill="#b6c8e8"/><path d="M204 292q-18 96 41 123q49 20 74-29" stroke="#5078bb" fill="none" strokeWidth="11" strokeLinecap="round"/><circle cx="320" cy="384" r="24" fill="#426db8"/><circle cx="320" cy="384" r="12" fill="#e7f0ff"/><rect x="202" y="375" width="158" height="101" rx="15" fill="#fff" stroke="#c6daf7" strokeWidth="4"/><rect x="226" y="392" width="66" height="10" rx="5" fill="#94b7eb"/><rect x="226" y="411" width="104" height="8" rx="4" fill="#dce8f8"/><rect x="226" y="429" width="88" height="8" rx="4" fill="#dce8f8"/><circle cx="331" cy="445" r="12" fill="#2cae93"/><path d="m325 445 4 4 8-9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round"/></svg><div className="hero-float rating-float"><b>★</b><span><strong>4.9 / 5</strong><small>Doctor ratings · demo</small></span></div><div className="hero-float visit-float"><b><Icon name="check" /></b><span><strong>Appointment ready</strong><small>Find a time that suits you</small></span></div></div></section></div>;
}

function BookingView({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<{ doctors: Doctor[]; demoMode: boolean }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [doctorId, setDoctorId] = useState<string>();
  const [specialtyFilter, setSpecialtyFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    async function loadDoctors() {
      try {
        const response = await fetch("/api/doctors", { signal, cache: "no-store" });
        if (!response.ok) throw new Error("Doctor catalog unavailable");
        const data = await response.json() as { doctors: Doctor[]; demoMode: boolean };
        if (!Array.isArray(data.doctors) || typeof data.demoMode !== "boolean") {
          throw new Error("Invalid doctor catalog");
        }
        if (!controller.signal.aborted) setCatalog(data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }

    void loadDoctors();
    return () => controller.abort();
  }, [attempt]);

  const doctors = catalog?.doctors ?? [];
  const specialties = [...new Set(doctors.map((doctor) => doctor.specialty))];
  const filteredDoctors = specialtyFilter
    ? doctors.filter((doctor) => doctor.specialty === specialtyFilter)
    : doctors;
  const selectedDoctor = filteredDoctors.find((doctor) => doctor.id === doctorId) ?? filteredDoctors[0];

  return (
    <section className="booking-page">
      <button className="back-button" onClick={onBack}>← Back to overview</button>
      <div className="booking-heading">
        <div>
          <span className="booking-overline">BOOK APPOINTMENT</span>
          <h2>Find the right doctor for you.</h2>
          <p>Browse our specialists and choose a doctor to see their availability.</p>
        </div>
        <span className="booking-step">CHOOSE A DOCTOR</span>
      </div>

      {error ? (
        <div className="doctor-list-panel" role="alert">
          <p>We couldn’t load the doctor directory.</p>
          <button className="primary-button" onClick={() => {
            setError(false);
            setAttempt((value) => value + 1);
          }}>Try again</button>
        </div>
      ) : !catalog ? (
        <p role="status">Loading doctors…</p>
      ) : (
        <>
          {catalog.demoMode && <p className="muted-note" role="status">Demo directory. Booking is unavailable.</p>}
          <div className="doctor-browser">
            <section className="doctor-list-panel" aria-label="Doctor directory">
              <div className="doctor-list-heading"><strong>Specialists</strong><span>{filteredDoctors.length} doctors</span></div>
              <div className="specialty-filters">
                <button className={!specialtyFilter ? "selected" : ""} onClick={() => setSpecialtyFilter("")}>All</button>
                {specialties.map((specialty) => (
                  <button key={specialty} className={specialtyFilter === specialty ? "selected" : ""}
                    onClick={() => setSpecialtyFilter(specialty)}>{specialty}</button>
                ))}
              </div>
              {filteredDoctors.length === 0 && <p>No doctors available.</p>}
              <div className="doctor-list">
                {filteredDoctors.map((doctor) => (
                  <button className={doctor.id === selectedDoctor?.id ? "doctor-list-row selected" : "doctor-list-row"}
                    key={doctor.id} onClick={() => setDoctorId(doctor.id)} aria-pressed={doctor.id === selectedDoctor?.id}>
                    <span className="list-avatar" aria-hidden="true" />
                    <span>
                      <strong>{doctor.name}</strong>
                      <small>{doctor.specialty}</small>
                    </span>
                    <b aria-hidden="true">›</b>
                  </button>
                ))}
              </div>
            </section>
            {selectedDoctor && (
              <section className="doctor-detail-panel" aria-label="Selected doctor profile">
                <div className="detail-profile">
                  <div>
                    <span className="booking-overline">SPECIALIST PROFILE</span>
                    <h3>{selectedDoctor.name}</h3>
                    <p>{selectedDoctor.specialty}</p>
                    {selectedDoctor.rating != null && <p>★ {selectedDoctor.rating} ({selectedDoctor.ratingCount} ratings)</p>}
                  </div>
                </div>
                {selectedDoctor.bio && <p className="detail-bio">{selectedDoctor.bio}</p>}
                <div className="detail-info-grid">
                  <div>
                    <small>Location</small>
                    <strong>{selectedDoctor.district}</strong>
                    <span>{selectedDoctor.address || selectedDoctor.clinicAddress}</span>
                  </div>
                </div>
                {!!selectedDoctor.certificates?.length && (
                  <div className="detail-section">
                    <h4>Education &amp; certificates</h4>
                    {selectedDoctor.certificates.map((certificate, index) => (
                      <p key={index}>{certificate.name} · {certificate.issuer}{certificate.issuedYear && (
                        <> · {certificate.issuedYear}</>
                      )}</p>
                    ))}
                  </div>
                )}
                {!catalog.demoMode && (
                  <Link className="primary-button detail-book" href={"/doctors/" + selectedDoctor.id + "/book"}>
                    View availability
                  </Link>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
