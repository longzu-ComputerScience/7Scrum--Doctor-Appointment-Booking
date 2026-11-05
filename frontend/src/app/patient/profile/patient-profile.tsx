"use client";
import Link from "next/link";
import { useAuth } from "../../auth/auth-provider";
import { apiMessage } from "@/lib/contract-api";
import styles from "../../patient-shell.module.css";
import { AvatarEditor } from "../../profile/avatar-editor";

export function PatientProfileView() {
  const { state, reload } = useAuth();
  return <section className={styles.emptyContainer} aria-labelledby="patient-profile-title"><div className={styles.emptyCard}>
    <span className={styles.emptyEyebrow}>PATIENT PROFILE</span><h2 id="patient-profile-title" className={styles.emptyTitle}>A little about you.</h2>
    {state.status === "loading" && <p role="status">Loading your profile…</p>}
    {state.status === "error" && <div role="alert"><p>{apiMessage(state.error)}</p><button className={styles.emptyPrimaryBtn} onClick={reload}>Try again</button></div>}
    {state.status === "signedOut" && <><p className={styles.emptyDescription}>Sign in to see your profile and prefill your appointment details.</p><Link className={styles.emptyPrimaryBtn} href="/patient/login">Sign in</Link><p><Link href="/patient/register">Create a patient account</Link></p></>}
    {state.status === "ready" && (state.identity.role === "patient" ? <>
      <AvatarEditor token={state.session.access_token} name={state.identity.patient.name}
        avatarUrl={state.identity.patient.avatarUrl} onSaved={reload} />
      <div className={styles.profileGrid}>{[["Full name", state.identity.patient.name], ["Email", state.identity.patient.email], ["Phone", state.identity.patient.phone], ["Account", "Patient"]].map(([label, value]) =>
        <div className={styles.profileField} key={label}><span className={styles.fieldLabel}>{label}</span><strong className={styles.fieldValue}>{value || "Not provided"}</strong></div>)}</div>
      <div className={styles.emptyActions}><Link className={styles.emptyPrimaryBtn} href="/#book">Find a doctor &amp; schedule a visit</Link><button className={styles.emptySecondaryBtn} onClick={reload}>Refresh profile</button></div>
    </> : <><p className={styles.emptyDescription}>You are signed in with a doctor account.</p><Link className={styles.emptyPrimaryBtn} href="/doctor">Open Doctor Dashboard</Link></>)}
  </div></section>;
}
