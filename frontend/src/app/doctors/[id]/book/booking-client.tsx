"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiMessage, ContractApiError } from "../../../../lib/contract-api";
import { BookingCalendar } from "./booking-calendar";
import { BookingDialog, BookingIcon } from "./booking-dialog";
import { useBookingIntegration, type BookingIntegration } from "./booking-session";
import { useBookingAvailability } from "./use-booking-availability";
import { bookingFieldErrors, createBooking, dateKey, formatDay, formatTime, validatePatient, type BookingSlot, type PatientErrors } from "./booking-utils";
import styles from "./booking.module.css";
import { discoveryHref, readDiscoveryContext } from "@/lib/specialty-handoff";

type Confirmation = { reference: string; slot: BookingSlot; patientName: string };
export type BookingClientProps = { doctorId: string; intercepted?: boolean };
export default function BookingClient(props: BookingClientProps) {
  const pathname = usePathname();
  const integration = useBookingIntegration();
  const session = integration.sessionState.status === "ready" ? integration.sessionState.session : null;
  // Parallel slots can retain their active subpage after returning to a hash-based
  // Dashboard section. Unmount the dialog/requests when its URL is no longer active.
  if (props.intercepted && pathname !== `/doctors/${encodeURIComponent(props.doctorId)}/book`) return null;
  return <BookingWorkspace key={props.doctorId + ":" + (session?.accessToken ?? integration.sessionState.status)} {...props} integration={integration} />;
}
function BookingWorkspace({ doctorId, intercepted = false, integration }: BookingClientProps & { integration: BookingIntegration }) {
  const router = useRouter();
  const sessionState = integration.sessionState;
  const session = sessionState.status === "ready" ? sessionState.session : null;
  const [selectedDate, setSelectedDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [name, setName] = useState(session?.patient.name ?? "");
  const [phone, setPhone] = useState(session?.patient.phone ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PatientErrors>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [focusError, setFocusError] = useState(0);
  const submitLock = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const onLoaded = useCallback((fresh: BookingSlot[]) => {
    setSlotId(current => fresh.some(slot => slot.id === current && slot.available) ? current : "");
  }, []);
  const availability = useBookingAvailability(doctorId, integration.subscribeToAvailability, onLoaded);
  const { doctor, slots, demo, loading } = availability;
  const firstAvailable = slots.find(slot => slot.available);
  const date = selectedDate || (firstAvailable ? dateKey(firstAvailable.startAt) : availability.range.from);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => { if (focusError) errorSummary.current?.focus(); }, [focusError]);
  function close() {
    if (submitLock.current) return;
    if (intercepted) router.back();
    else {
      const context = readDiscoveryContext(new URLSearchParams(window.location.search));
      router.push(discoveryHref(context.specialty, doctorId));
    }
  }
  function retry() { setError(""); setSlotId(""); void availability.refresh(); }
  function reportError(message: string) { setError(message); setFocusError(value => value + 1); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || demo || loading || confirmation || uncertain || accessBlocked || availability.error) return;
    if (!session?.accessToken) { reportError("Sign in with a Patient account before booking."); return; }
    const errors = validatePatient(name, phone, notes); setFieldErrors(errors);
    if (Object.keys(errors).length) { reportError("Please check your booking details below."); return; }
    const selectedSlot = slots.find(slot => slot.id === slotId && slot.available && Date.parse(slot.startAt) > Date.now());
    if (!selectedSlot) { setSlotId(""); reportError("Please select an available time in the future to continue."); return; }
    submitLock.current = true; setSubmitting(true); setError("");
    const controller = new AbortController(); mutation.current = controller;
    try {
      const result = await createBooking(session.accessToken, selectedSlot.id, name, phone, notes, controller.signal);
      if (controller.signal.aborted) return;
      setConfirmation({ reference: result.reference, slot: selectedSlot, patientName: name.normalize("NFC").trim() });
      setSlotId(""); void availability.refresh();
    } catch (failure) {
      if (controller.signal.aborted) return;
      const apiError = failure instanceof ContractApiError ? failure : new ContractApiError("network");
      setFieldErrors(bookingFieldErrors(apiError));
      if (apiError.status === 401 || apiError.status === 403) setAccessBlocked(true);
      if (apiError.status === 409) { setSlotId(""); await availability.refresh(); }
      if (apiError.uncertain) { setUncertain(true); setSlotId(""); void availability.refresh(); }
      reportError(apiMessage(apiError));
    } finally { submitLock.current = false; if (!controller.signal.aborted) setSubmitting(false); }
  }
  const selectedSlot = slots.find(slot => slot.id === slotId && slot.available);
  const bookingHint = demo
    ? "Online booking is unavailable in demo mode. These times are for preview only, and your details will not be submitted."
    : !session?.accessToken ? "Sign in with a Patient account to book."
      : !selectedSlot ? "Select an available time to continue." : "";
  const daySlots = slots.filter(slot => dateKey(slot.startAt) === date);

  const fields = [
    { key: "name" as const, id: "patient-name", label: "Full name", value: name, setter: setName, autoComplete: "name", maxLength: 100, placeholder: "Enter your full name" },
    { key: "phone" as const, id: "patient-phone", label: "Phone number", value: phone, setter: setPhone, autoComplete: "tel", maxLength: 20, placeholder: "e.g. 0900000000" },
  ];

  return (
    <BookingDialog onClose={close} busy={submitting} confirmed={Boolean(confirmation)}>
      {confirmation && doctor ? (
        <div className={styles.confirmation}>
          <span className={styles.successIcon}><BookingIcon name="check" /></span>
          <p className={styles.eyebrow}>APPOINTMENT BOOKED</p>
          <h1 id="booking-title" tabIndex={-1}>Your appointment is confirmed</h1>
          <p className={styles.description}>Save your booking reference and arrive at the clinic on time.</p>
          <div className={styles.ticket}>
            <div className={styles.reference}><span>Booking reference</span><strong>{confirmation.reference}</strong><span className={styles.confirmedBadge}><BookingIcon name="check" /> Confirmed</span></div>
            <dl className={styles.details}>
              <div><dt>Doctor</dt><dd>{doctor.name}<small>{doctor.specialty}</small></dd></div>
              <div><dt>Patient</dt><dd>{confirmation.patientName}</dd></div>
              <div><dt>Appointment date</dt><dd>{formatDay(confirmation.slot.startAt)}</dd></div>
              <div><dt>Time · Vietnam</dt><dd>{formatTime(confirmation.slot.startAt)} – {formatTime(confirmation.slot.endAt)}</dd></div>
              <div className={styles.fullWidth}><dt>In-person visit at</dt><dd>{doctor.district}<small>{doctor.address}</small></dd></div>
            </dl>
          </div>
          <button className={styles.primary} type="button" onClick={close}>Back to doctors</button>
        </div>
      ) : (
        <>
          <header className={styles.heading}>
            {!intercepted && (
              <button type="button" className={styles.backLink} onClick={close} aria-label="Return to patient dashboard">
                <BookingIcon name="left" /> <span>Back to dashboard</span>
              </button>
            )}
            <p className={styles.eyebrow}>CHOOSE YOUR VISIT</p>
            <h1 id="booking-title" tabIndex={-1}>Book an appointment</h1>
            <p className={styles.description}>Choose a date and time that works for you. Let Carely connect you with your doctor.</p>
          </header>
          {loading ? <div className={styles.loading} role="status"><span className={styles.spinner} /> Loading doctor and available times…</div> : !doctor ? (
            <div className={styles.empty}><p role="alert">{error || apiMessage(availability.error)}</p><button className={styles.secondary} onClick={retry}>Try again</button></div>
          ) : (
            <form onSubmit={submit} noValidate aria-busy={submitting}>
              <div className={styles.doctor}>
                <span className={styles.avatar}><BookingIcon name="doctor" /></span>
                <div><h2>{doctor.name}</h2><p>{doctor.specialty} · {doctor.district}</p></div>
                <span className={styles.visitType}><BookingIcon name="pin" /> In-person visit</span>
              </div>
              {sessionState.status === "loading" && <p className={styles.notice} role="status">Checking your Patient session…</p>}
              {sessionState.status === "error" && <p className={styles.notice} role="alert">{apiMessage(sessionState.error)} Sign in again through the Patient account menu.</p>}
              {sessionState.status === "ready" && !session && <div className={styles.notice} role="status">Sign in with a Patient account to book. {integration.onRequireLogin && <button type="button" className={styles.textButton} onClick={integration.onRequireLogin}>Patient sign in</button>}</div>}
              {demo && <p className={styles.notice} role="status">Demo mode: these times are for preview only. Booking will be available once the service is configured.</p>}
              <div className={styles.columns}>
                <section className={styles.schedule} aria-labelledby="schedule-title">
                  <h2 id="schedule-title" className={styles.sectionTitle}><span>1</span> Select date & time</h2>
                  <p className={styles.caption}><BookingIcon name="clock" /> Vietnam time (UTC+7)</p>
                  <BookingCalendar slots={slots} range={availability.range} selectedDate={date} onSelect={(date) => { setSelectedDate(date); setSlotId(""); }} disabled={submitting || availability.refreshing} />
                  <div className={styles.timeHeading}><h3>Available times</h3><button className={styles.textButton} type="button" onClick={retry} disabled={submitting || availability.refreshing}>Refresh times</button></div>
                  <p className={styles.caption}>{formatDay(date + "T00:00:00+07:00")}</p>
                  <p className={styles.caption} role="status">{availability.refreshing ? "Refreshing times…" : "System-generated 30-minute appointments · next 28 days"}</p>
                  {availability.error ? <p className={styles.errorSummary} role="alert">{apiMessage(availability.error)} Refresh times before booking.</p> : null}
                  <div className={styles.slots} role="group" aria-label="Choose an appointment time">
                    {daySlots.map((slot) => (
                      <button key={slot.id} type="button" className={`${styles.slot} ${slotId === slot.id && slot.available ? styles.selectedSlot : ""}`} aria-pressed={slotId === slot.id && slot.available} disabled={submitting || !slot.available} onClick={() => setSlotId(slot.id)}>
                        <span className={styles.radio} aria-hidden="true" />{formatTime(slot.startAt)} – {formatTime(slot.endAt)}<small>{slot.available ? "Available" : "Unavailable"}</small>
                      </button>
                    ))}
                  </div>
                  {!daySlots.length && <div className={styles.empty} role="status"><BookingIcon name="calendar" /><p>{slots.length ? "No appointments are available on this date. Please choose another date." : "No appointments are currently available. Refresh times or choose another doctor."}</p></div>}
                </section>
                <section className={styles.patient} aria-labelledby="patient-title">
                  <h2 id="patient-title" className={styles.sectionTitle}><span>2</span> Patient information</h2>
                  <p className={styles.caption}>We will use these details to confirm your appointment.</p>
                  {error && <div className={styles.errorSummary} role="alert" tabIndex={-1} ref={errorSummary}>
                    <p>{error}</p>
                    {Object.entries(fieldErrors).some(([, message]) => message) && <ul>{Object.entries(fieldErrors).filter(([, message]) => message).map(([field, message]) => <li key={field}><a href={`#patient-${field}`}>{message}</a></li>)}</ul>}
                  </div>}
                  <fieldset className={styles.fieldset} disabled={submitting || !session?.accessToken || accessBlocked || uncertain}>
                    <legend className={styles.srOnly}>Contact information</legend>
                    {fields.map((field) => <div className={styles.field} key={field.key}>
                      <label htmlFor={field.id}>{field.label} <span aria-hidden="true">*</span></label>
                      <input id={field.id} type={field.key === "phone" ? "tel" : "text"} required autoComplete={field.autoComplete} maxLength={field.maxLength} placeholder={field.placeholder} value={field.value}
                        aria-invalid={Boolean(fieldErrors[field.key])} aria-describedby={fieldErrors[field.key] ? `${field.id}-error` : undefined}
                        onChange={(event) => field.setter(event.target.value)}
                        onBlur={() => setFieldErrors((current) => ({ ...current, [field.key]: validatePatient(name, phone, notes)[field.key] }))} />
                      {fieldErrors[field.key] && <p id={`${field.id}-error`} className={styles.fieldError}>{fieldErrors[field.key]}</p>}
                    </div>)}
                    <div className={styles.field}>
                      <label htmlFor="patient-notes">Notes <span className={styles.optional}>(optional)</span></label>
                      <textarea id="patient-notes" rows={3} maxLength={500} value={notes} placeholder="Anything else about your appointment" aria-invalid={Boolean(fieldErrors.notes)} aria-describedby="patient-notes-hint patient-notes-error" onChange={(event) => setNotes(event.target.value)} />
                      <p id="patient-notes-hint" className={styles.caption}>Please do not include sensitive health information.</p>
                      <p id="patient-notes-error" className={styles.fieldError}>{fieldErrors.notes}</p>
                    </div>
                  </fieldset>
                  <div className={styles.summary}>
                    <h3>Appointment summary</h3>
                    <p><BookingIcon name="calendar" /><span>{selectedSlot ? formatDay(selectedSlot.startAt) : "No time selected"}</span></p>
                    {selectedSlot && <p><BookingIcon name="clock" /><span>{formatTime(selectedSlot.startAt)} – {formatTime(selectedSlot.endAt)} (UTC+7)</span></p>}
                    <p><BookingIcon name="pin" /><span>{doctor.address}</span></p>
                  </div>
                  {bookingHint && <p id="booking-availability" className={styles.notice} role="status">{bookingHint}</p>}
                  <button className={styles.primary} type="submit" disabled={!selectedSlot || submitting || demo || !session?.accessToken || accessBlocked || uncertain || Boolean(availability.error)} aria-describedby={bookingHint ? "booking-availability" : undefined}>
                    {submitting ? <><span className={styles.spinner} /> Confirming…</> : demo ? "Booking unavailable in demo" : <>Confirm appointment <BookingIcon name="arrow" /></>}
                  </button>
                  <div>{uncertain && <div className={styles.notice} role="alert"><p>The booking may already exist. Check with the care team before trying again. No automatic booking retry will be sent.</p><button type="button" className={styles.textButton} disabled={submitting || availability.refreshing || Boolean(availability.error)} onClick={async () => { if (await availability.refresh()) { setUncertain(false); setError(""); } }}>I checked with the care team; allow another attempt</button></div>}</div>
                  <p className={styles.footerNote}>{submitting ? "We are checking and saving your appointment. Please wait for confirmation." : "No payment is collected at this step. Availability is checked again when you confirm."}</p>
                </section>
              </div>
            </form>
          )}
        </>
      )}
    </BookingDialog>
  );
}
