"use client";

import { AppointmentList } from "./appointment-list";
import styles from "./confirmed-appointments.module.css";

export type ConfirmedAppointmentsProps = {
  /** Supabase Auth session.access_token. Never pass a service-role key. */
  token: string;
  /** Auth-owning page refreshes the SDK session or returns to its sign-in view. */
  onSessionExpired: () => void;
  /** Approved requested -> confirmed flow. No other mutations are exposed. */
  allowConfirmation?: boolean;
};

/** V2 integration entry point for FE2. No login, navigation, or availability ownership. */
export function ConfirmedAppointments({ token, onSessionExpired, allowConfirmation = true }: ConfirmedAppointmentsProps) {
  return <section className={styles.dashboard} aria-label="Assigned doctors' appointments">
    <AppointmentList token={token} preview={false} initialStatus="confirmed"
      onSessionExpired={onSessionExpired} allowConfirmation={allowConfirmation} />
  </section>;
}
