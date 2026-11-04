"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./booking.module.css";

type IconName = "left" | "right" | "arrow" | "clock" | "calendar" | "pin" | "doctor" | "check" | "close";
const paths: Record<IconName, ReactNode> = {
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  doctor: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2M9 16v4m-2-2h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
};

export function BookingIcon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function BookingDialog({ children, onClose, busy, confirmed }: { children: ReactNode; onClose: () => void; busy: boolean; confirmed: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    element?.querySelector<HTMLElement>("#booking-title")?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (confirmed) dialog.current?.querySelector<HTMLElement>("#booking-title")?.focus();
  }, [confirmed]);

  return <dialog ref={dialog} lang="en" className={`${styles.dialog} ${confirmed ? styles.confirmedDialog : ""}`} aria-labelledby="booking-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || busy) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className={styles.dialogContent}>
      <button type="button" className={`${styles.iconButton} ${styles.close}`} aria-label="Close booking dialog" onClick={onClose} disabled={busy}><BookingIcon name="close" /></button>
      {children}
    </div>
  </dialog>;
}
