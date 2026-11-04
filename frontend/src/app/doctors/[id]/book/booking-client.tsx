"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentSlot, Doctor } from "@/lib/types";
import { BookingCalendar } from "./booking-calendar";
import { BookingDialog, BookingIcon } from "./booking-dialog";
import { dateKey, formatDay, formatTime, loadBookingData, validatePatient, type PatientErrors } from "./booking-utils";
import styles from "./booking.module.css";

type Confirmation = { reference: string; slot: AppointmentSlot; patientName: string };

export default function BookingClient({ doctorId, intercepted = false }: { doctorId: string; intercepted?: boolean }) {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [demo, setDemo] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PatientErrors>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [focusError, setFocusError] = useState(0);
  const submitLock = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadBookingData(doctorId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDoctor(data.doctor);
        setSlots(data.slots);
        setDemo(data.demo);
        setSelectedDate(data.slots[0] ? dateKey(data.slots[0].startAt) : dateKey(new Date().toISOString()));
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Unable to load the doctor or available appointments. Please try again.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [doctorId, attempt]);

  useEffect(() => {
    if (focusError) errorSummary.current?.focus();
  }, [focusError]);

  function close() {
    if (submitLock.current) return;
    if (intercepted) router.back();
    else router.push("/");
  }

  function retry() {
    setLoading(true);
    setError("");
    setSlotId("");
    setAttempt((value) => value + 1);
  }

  function reportError(message: string) {
    setError(message);
    setFocusError((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || demo || loading || confirmation) return;
    const errors = validatePatient(name, phone, notes);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      reportError("Please check your booking details below.");
      return;
    }
    const selectedSlot = slots.find((slot) => slot.id === slotId);
    if (!selectedSlot || new Date(selectedSlot.startAt).getTime() <= Date.now()) {
      setSlotId("");
      reportError("Please select an available time in the future to continue.");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, patientName: name.trim(), patientPhone: phone.trim(), notes: notes.trim() }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 409) {
        setSlotId("");
        // Never retain stale availability if the refresh fails.
        setSlots([]);
        try {
          const refreshed = await loadBookingData(doctorId);
          setSlots(refreshed.slots);
          setDemo(refreshed.demo);
          reportError("This time slot was just booked. Availability has been updated; please select another time.");
        } catch {
          reportError("This time slot was just booked. We could not refresh availability; please select Refresh times.");
        }
        return;
      }
      if (response.status === 422) {
        const data = await response.json().catch(() => ({})) as { detail?: { loc?: string[] }[] };
        const invalid: PatientErrors = {};
        if (Array.isArray(data.detail)) {
          for (const item of data.detail) {
            const field = item.loc?.at(-1);
            if (field === "patientName") invalid.name = "Check your full name (2–100 characters).";
            if (field === "patientPhone") invalid.phone = "Check your phone number (9–20 characters).";
            if (field === "notes") invalid.notes = "Notes must be 500 characters or fewer.";
          }
        }
        setFieldErrors(invalid);
        reportError("Some booking details are invalid. Check your name and phone number, and select another time if needed.");
        return;
      }
      if (response.status === 503) {
        reportError("The booking service is temporarily unavailable. Please try again later.");
        return;
      }
      if (!response.ok) {
        reportError("Unable to confirm your appointment. Please try again later or contact the clinic.");
        return;
      }
      const data = await response.json() as { status?: string; bookingReference?: string; appointmentId?: string; demoMode?: boolean };
      if (response.status !== 201 || data.status !== "confirmed" || data.demoMode ||
          typeof data.bookingReference !== "string" || !data.bookingReference.trim() ||
          typeof data.appointmentId !== "string" || !data.appointmentId.trim()) {
        reportError("We have not received a valid confirmation. Please check with the clinic before submitting again to avoid a duplicate booking.");
        return;
      }
      setConfirmation({ reference: data.bookingReference, slot: selectedSlot, patientName: name.trim() });
    } catch {
      reportError("The connection was interrupted or the response was invalid. Please check with the clinic before submitting again to avoid a duplicate booking.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const selectedSlot = slots.find((slot) => slot.id === slotId);
  const daySlots = slots.filter((slot) => dateKey(slot.startAt) === selectedDate);
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
              <div className={styles.fullWidth}><dt>In-person visit at</dt><dd>{doctor.clinicName}<small>{doctor.clinicAddress}</small></dd></div>
            </dl>
          </div>
          <button className={styles.primary} type="button" onClick={close}>Back to doctors</button>
        </div>
      ) : (
        <>
          <header className={styles.heading}>
            <p className={styles.eyebrow}>CHOOSE YOUR VISIT</p>
            <h1 id="booking-title" tabIndex={-1}>Book an appointment</h1>
            <p className={styles.description}>Choose a date and time that works for you. Let Carely connect you with your doctor.</p>
          </header>
          {loading ? <div className={styles.loading} role="status"><span className={styles.spinner} /> Loading doctor and available times…</div> : !doctor ? (
            <div className={styles.empty}><p role="alert">{error}</p><button className={styles.secondary} onClick={retry}>Try again</button></div>
          ) : (
            <form onSubmit={submit} noValidate aria-busy={submitting}>
              <div className={styles.doctor}>
                <span className={styles.avatar}><BookingIcon name="doctor" /></span>
                <div><h2>{doctor.name}</h2><p>{doctor.specialty} · {doctor.clinicName}</p></div>
                <span className={styles.visitType}><BookingIcon name="pin" /> In-person visit</span>
              </div>
              {demo && <p className={styles.notice} role="status">Demo mode: these times are for preview only. Booking will be available once the service is configured.</p>}
              <div className={styles.columns}>
                <section className={styles.schedule} aria-labelledby="schedule-title">
                  <h2 id="schedule-title" className={styles.sectionTitle}><span>1</span> Select date & time</h2>
                  <p className={styles.caption}><BookingIcon name="clock" /> Vietnam time (UTC+7)</p>
                  <BookingCalendar key={attempt} slots={slots} selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setSlotId(""); }} disabled={submitting} />
                  <div className={styles.timeHeading}><h3>Available times</h3><button className={styles.textButton} type="button" onClick={retry} disabled={submitting}>Refresh times</button></div>
                  <p className={styles.caption}>{selectedDate && formatDay(selectedDate + "T00:00:00+07:00")}</p>
                  <div className={styles.slots} role="group" aria-label="Choose an appointment time">
                    {daySlots.map((slot) => (
                      <button key={slot.id} type="button" className={`${styles.slot} ${slotId === slot.id ? styles.selectedSlot : ""}`} aria-pressed={slotId === slot.id} disabled={submitting} onClick={() => setSlotId(slot.id)}>
                        <span className={styles.radio} aria-hidden="true" />{formatTime(slot.startAt)} – {formatTime(slot.endAt)}
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
                  <fieldset className={styles.fieldset} disabled={submitting}>
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
                    <p><BookingIcon name="pin" /><span>{doctor.clinicAddress}</span></p>
                  </div>
                  <button className={styles.primary} type="submit" disabled={!selectedSlot || submitting || demo}>
                    {submitting ? <><span className={styles.spinner} /> Confirming…</> : <>Confirm appointment <BookingIcon name="arrow" /></>}
                  </button>
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
