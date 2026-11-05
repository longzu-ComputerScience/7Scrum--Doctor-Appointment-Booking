"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { doctorForDisplay, type CatalogDoctor } from "@/lib/doctor-display";
import { DoctorAvailability } from "./doctor-availability";
import styles from "./doctor-browser.module.css";
import { loadDiscoveryCatalog } from "@/lib/doctor-catalog";
import { loadSpecialtyOptions } from "@/lib/specialty-options";
import { apiMessage } from "@/lib/contract-api";
import { canonicalSpecialty, discoveryHref, doctorBookingHref, readDiscoveryContext } from "@/lib/specialty-handoff";

type Catalog = {
  status: "loading" | "ready" | "error";
  doctors: CatalogDoctor[];
  demoMode: boolean;
  key?: string;
  error?: unknown;
};

const initialCatalog: Catalog = { status: "loading", doctors: [], demoMode: false };

function initials(name: string) {
  return name.replace(/^(Dr\.|BS\.)\s*/i, "").replace(/\s*\(Demo\)$/i, "")
    .trim().split(/\s+/).slice(-2).map((part) => part[0]).join("");
}

function RatingPlaceholder({ doctor }: { doctor?: CatalogDoctor }) {
  return <span className={styles.ratingPlaceholder}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" /></svg>
    {typeof doctor?.rating === "number" && (doctor.ratingCount ?? 0) > 0 ? `${doctor.rating.toFixed(1)} · ${doctor.ratingCount} ratings` : "No ratings yet"}
  </span>;
}

export function DoctorBrowser({ query }: { query: string }) {
  return <Suspense fallback={<p role="status">Loading doctor discovery…</p>}><DoctorDiscovery query={query} /></Suspense>;
}

function DoctorDiscovery({ query }: { query: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { specialty, doctorId } = readDiscoveryContext(params);
  // A prop-aware override avoids synchronously setting state in an effect.
  const [keywordOverride, setKeywordOverride] = useState<{ query: string; value: string } | null>(null);
  const keyword = keywordOverride?.query === query ? keywordOverride.value : query;
  const [district, setDistrict] = useState("");
  const filterKey = JSON.stringify([specialty, keyword, district]);
  const [loadedCatalog, setCatalog] = useState<Catalog>(initialCatalog);
  const catalog = loadedCatalog.key === filterKey ? loadedCatalog : initialCatalog;
  const [attempt, setAttempt] = useState(0);
  const [specialties, setSpecialties] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSpecialtyOptions(controller.signal).then(setSpecialties).catch(() => {
      // Catalog loading below can still supply options.
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await loadDiscoveryCatalog(specialty, keyword, controller.signal, district);
        if (!controller.signal.aborted) {
          setCatalog({ status: "ready", doctors: data.doctors.map(doctorForDisplay), demoMode: data.demoMode, key: filterKey });
          setSpecialties(current => [...new Map([...current, ...data.doctors.map(d => ({ value: canonicalSpecialty(d.specialty)!, label: doctorForDisplay(d).specialty }))].map(item => [item.value, item])).values()]);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCatalog({ status: "error", doctors: [], demoMode: false, error, key: filterKey });
        }
      }
    }
    // Search and specialty are filtered by the API before its 100-row cap.
    const timer = window.setTimeout(() => { setCatalog(initialCatalog); void load(); }, keyword || district ? 280 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [attempt, specialty, keyword, district, filterKey]);

  const doctors = catalog.doctors;
  // Resolve the selection from the visible list so filters never show an unrelated profile.
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId) ?? doctors[0];
  const chooseSpecialty = (value: string | null) => {
    if (canonicalSpecialty(value) === specialty) return;
    setCatalog(initialCatalog);
    router.push(discoveryHref(value), { scroll: false });
  };
  const rememberDoctor = (id: string) => {
    // Replace the discovery entry before Link pushes the intercepted route.
    // Next preserves its routing tree when using the native History API.
    window.history.replaceState(null, "", discoveryHref(specialty, id));
  };

  return (
    <section className={`booking-page ${styles.catalog}`} aria-labelledby="doctor-browser-title">
      <div className="booking-heading">
        <div>
          <span className="booking-overline">BOOK APPOINTMENT</span>
          <h2 id="doctor-browser-title">Find the right doctor for you.</h2>
          <p>Browse our specialists and choose a doctor to see their availability.</p>
        </div>
        <span className="booking-step">CHOOSE A DOCTOR</span>
      </div>

      {specialty && <div className={styles.notice}>
        <p>Selected specialty: <strong>{specialty}</strong>. Browse matching doctors and review their profile before choosing a time.</p>
        <button className="text-button" onClick={() => chooseSpecialty(null)}>Clear recommendation · All specialties</button>
      </div>}
      {catalog.status === "loading" ? (
        <div className={styles.feedback} role="status">Loading doctors…</div>
      ) : catalog.status === "error" ? (
        <div className={styles.feedback}>
          <p role="alert">{apiMessage(catalog.error)}</p>
          <button className="primary-button" onClick={() => {
            setCatalog(initialCatalog);
            setAttempt((value) => value + 1);
          }}>Try again</button>
        </div>
      ) : (
        <>
          {catalog.demoMode && (
            <p className={styles.notice} role="status">Demo mode: these catalog doctors and times are previews. Real booking requires the service to be configured.</p>
          )}
          <div className="doctor-browser">
            <section className="doctor-list-panel" aria-label="Doctor catalog">
              <div className="doctor-list-heading">
                <strong>Specialists</strong>
                <span role="status">{doctors.length} {doctors.length === 1 ? "doctor" : "doctors"}{doctors.length >= 100 ? " · refine your search" : ""}</span>
              </div>
              <div className={styles.filterToolbar} role="group" aria-label="Find and filter doctors">
                <label className={styles.filterField}>Specialty
                  <select aria-label="Specialty" value={specialty ?? ""} onChange={event => chooseSpecialty(event.target.value || null)}>
                    <option value="">All specialties</option>
                    {specialty && !specialties.some(item => item.value === specialty) &&
                      <option value={specialty}>{specialty}</option>}
                    {specialties.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className={styles.filterField}>Search doctor
                  <input value={keyword} onChange={event => setKeywordOverride({ query, value: event.target.value })}
                    placeholder="Name or specialty" maxLength={100} type="search" />
                </label>
                <label className={styles.filterField}>District
                  <input value={district} onChange={event => setDistrict(event.target.value)}
                    placeholder="Any district" maxLength={80} type="search" />
                </label>
                {(keyword || district || specialty) && <button type="button" className={styles.clearFilters}
                  onClick={() => { setKeywordOverride({ query, value: "" }); setDistrict(""); chooseSpecialty(null); }}>Reset</button>}
              </div>
              <div className="doctor-list">
                {doctors.map((doctor) => (
                  <Link key={doctor.id} className={`doctor-list-row ${selectedDoctor?.id === doctor.id ? "selected" : ""}`}
                    href={doctorBookingHref(doctor.id, specialty)} scroll={false} onNavigate={() => rememberDoctor(doctor.id)}>
                    <span className="list-avatar" aria-hidden="true">{initials(doctor.name)}</span>
                    <span><strong>{doctor.name}</strong><small>{doctor.specialty}</small><span className={styles.listMetadata}><RatingPlaceholder doctor={doctor} /></span></span>

                  </Link>
                ))}
                {!doctors.length && <div className={styles.empty} role="status"><p>{specialty || keyword || district ? "No doctors match your search and specialty. Try another search or browse all specialties." : "No doctors are available in the catalog yet. Please check again later."}</p>
                  <button className="text-button" onClick={() => { setCatalog(initialCatalog); setAttempt(value => value + 1); }}>Try again</button>
                </div>}
              </div>
            </section>

            {selectedDoctor && (
              <section className="doctor-detail-panel" aria-label="Selected doctor">
                <div className="detail-profile">
                  <div className="detail-avatar" aria-hidden="true">{initials(selectedDoctor.name)}</div>
                  <div>
                    <span className="booking-overline">SPECIALIST PROFILE</span>
                    <h3>{selectedDoctor.name}</h3>
                    <p className={styles.profileMetadata}>{selectedDoctor.specialty}<RatingPlaceholder doctor={selectedDoctor} /></p>
                  </div>
                </div>
                {selectedDoctor.bio && <p className="detail-bio">{selectedDoctor.bio}</p>}
                <div className="detail-info-grid">
                  <div><small>Visit type</small><strong>In-person visit</strong></div>
                  <div><small>Location</small><strong>{selectedDoctor.district}</strong><span>{selectedDoctor.address}</span></div>
                </div>
                <section className={styles.education} aria-labelledby="doctor-education-title">
                  <h4 id="doctor-education-title">Education &amp; certificates</h4>
                  <div className={styles.educationRow}>
                    <span className={styles.educationIcon} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="m2 9 10-5 10 5-10 5Zm4 2v6c3 3 9 3 12 0v-6M22 9v7" /></svg>
                    </span>
                    <div>{selectedDoctor.certificates?.length ? selectedDoctor.certificates.map((certificate, index) => <div key={index}><p>{certificate.name}</p><small>{certificate.issuer}{certificate.issuedYear ? ` · ${certificate.issuedYear}` : ""}</small></div>) : <><p>Not provided yet</p><small>Education and professional certificates have not been provided.</small></>}</div>
                  </div>
                </section>
                <div className="detail-extra-grid">
                  <DoctorAvailability key={selectedDoctor.id} doctorId={selectedDoctor.id} />
                  <div><h4>Specialty</h4><p>{selectedDoctor.specialty}</p></div>
                  <div><h4>Procedures</h4><p>Not provided yet</p><p>The clinic has not listed procedures for this doctor.</p></div>
                  <div className="reviews-block">
                    <div className={styles.reviewsHeading}><h4>Doctor’s Reviews</h4><RatingPlaceholder doctor={selectedDoctor} /></div>
                    <article className={`review-card ${styles.reviewEmpty}`}>
                      <span className={styles.reviewIcon} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0ZM7 10h10M7 14h6" /></svg>
                      </span>
                      <div><strong>Written reviews unavailable</strong><p>Individual patient reviews have not been provided.</p></div>
                    </article>
                  </div>
                </div>
                <Link className="primary-button detail-book" href={doctorBookingHref(selectedDoctor.id, specialty)} scroll={false} onNavigate={() => rememberDoctor(selectedDoctor.id)}>
                  Book with {selectedDoctor.name}
                </Link>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
