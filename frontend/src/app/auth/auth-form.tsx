"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiMessage, ContractApiError, isRecord } from "@/lib/contract-api";
import { normalize, registerAccount, registrationErrors, registrationMessage, safeReturnTo, type Registration, type Role } from "@/lib/fe1-api";
import styles from "./auth.module.css";

function loginMessage(error: unknown) {
  const code = isRecord(error) ? error.code : null;
  if (code === "email_not_confirmed") return "Confirm your email before signing in. Check your inbox or resend the confirmation below.";
  if (code === "invalid_credentials") return "The email or password is incorrect.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many attempts. Please wait a moment and try again.";
  return "Could not sign in. Check your connection and try again.";
}
export function AuthForm({ role, register = false }: { role: Role; register?: boolean }) {
  const { state, configured, signOut, reload } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState<Registration>({ name: "", email: "", phone: "", password: "", confirmation: "", address: "", specialty: "", certificateName: "", certificateIssuer: "", certificateNumber: "" });
  const [evidence, setEvidence] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const lock = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const title = register ? (role === "doctor" ? "Join your care team." : "Your care starts here.") : "Welcome back.";

  useEffect(() => {
    if (!register && state.status === "ready" && state.identity.role === role) {
      router.replace(safeReturnTo(new URLSearchParams(window.location.search).get("next"), role));
    }
  }, [register, role, router, state]);
  const change = (field: keyof Registration, next: string) => {
    setValue(current => ({ ...current, [field]: next }));
    setErrors(current => ({ ...current, [field]: "" })); setMessage("");
  };
  async function resend() {
    if (lock.current) return;
    if (Date.now() < resendAfter) { setMessage("Please wait one minute before requesting another email."); return; }
    const email = normalize(value.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErrors({ email: "Enter your email address first." }); return; }
    const client = getSupabaseBrowser();
    if (!client) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const { error } = await client.auth.resend({ type: "signup", email });
      if (error) throw error;
      setNotice("Confirmation requested. Check your inbox and spam folder, then return to sign in."); setResendAfter(Date.now() + 60_000);
    } catch { setMessage("Could not send the confirmation email. Please wait and try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || (!configured && !(register && role === "doctor")) || created || uncertain) return;
    const validation: Record<string, string> = register ? registrationErrors(value, role) : {
      ...(!normalize(value.email) ? { email: "Enter your email address." } : {}),
      ...(!value.password ? { password: "Enter your password." } : {}),
    };
    if (register && role === "doctor" && !evidence) validation.evidence = "Choose a certificate document.";
    if (evidence && (evidence.size > 10 * 1024 * 1024 || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(evidence.type))) validation.evidence = "Use a PDF or image under 10 MB.";
    setErrors(validation); setMessage(""); setNotice("");
    if (Object.keys(validation).length) {
      setMessage("Please check the highlighted fields."); requestAnimationFrame(() => summary.current?.focus()); return;
    }
    if (register && role === "doctor") {
      setNotice("Details are ready for preview. Your account and certificate have not been submitted; the registration API needs to support these fields and file upload.");
      return;
    }
    const client = getSupabaseBrowser();
    if (!client) return;
    lock.current = true; setBusy(true);
    try {
      if (register) {
        await registerAccount(role, value);
        setCreated(true); setValue(current => ({ ...current, password: "", confirmation: "" }));
        setNotice("Your account was created. Confirm your email before signing in.");
        try {
          const { error } = await client.auth.resend({ type: "signup", email: normalize(value.email) });
          if (error) throw error;
          setResendAfter(Date.now() + 60_000);
        } catch { setMessage("Your account was created, but the confirmation email could not be sent. Use Resend confirmation below."); }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: normalize(value.email), password: value.password });
        if (error) throw error;
        setValue(current => ({ ...current, password: "" }));
        reload();
      }
    } catch (error) {
      setMessage(register ? registrationMessage(error) : loginMessage(error));
      if (register && (!(error instanceof ContractApiError) || error.uncertain)) setUncertain(true);
      if (error instanceof ContractApiError && error.status === 422 && isRecord(error.body) && Array.isArray(error.body.detail)) {
        const fieldErrors: Record<string, string> = {};
        for (const item of error.body.detail) if (isRecord(item) && Array.isArray(item.loc)) {
          const field = item.loc[1];
          if (typeof field === "string" && field in value) fieldErrors[field] = "Check this value and try again.";
        }
        setErrors(fieldErrors);
      }
      requestAnimationFrame(() => summary.current?.focus());
    } finally { lock.current = false; setBusy(false); }
  }
  function field(key: keyof Registration, label: string, type = "text", autoComplete = "off") {
    return <label className={styles.field} htmlFor={`auth-${key}`} key={key}>{label}
      <input id={`auth-${key}`} name={key} type={type} autoComplete={autoComplete} value={value[key]}
        onChange={e => change(key, e.target.value)} required disabled={busy || created}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `error-${key}` : undefined} />
      {errors[key] && <span className={styles.fieldError} id={`error-${key}`}>{errors[key]}</span>}
    </label>;
  }
  return <main className={styles.page}>
    <aside className={styles.story}>
      <Link className={styles.brand} href="/" aria-label="Carely home"><span aria-hidden="true">✳</span> carely.</Link>
      <div className={styles.storyBody}><span className={styles.eyebrow}>THOUGHTFUL CARE, MADE SIMPLE</span>
        <h2>{role === "doctor" ? <>More time for<br /><em>the people</em><br />you care for.</> : <>Expert care.<br /><em>A little closer.</em></>}</h2>
        <div className={styles.storyCard}><span className={styles.symbol} aria-hidden="true">{role === "doctor" ? "⌘" : "+"}</span>
          <div><strong>{role === "doctor" ? "Care on your schedule" : "Care that fits your day"}</strong></div>
        </div>
      </div><small>Carely · Patient &amp; Doctor portal</small>
    </aside>
    <section className={styles.formSide}>
      <Link className={styles.back} href="/">Back to Carely</Link>
      <div className={styles.formContent}>
        <div className={styles.roleSwitch} aria-label="Choose your portal">
          <Link href={`/patient/${register ? "register" : "login"}`} aria-current={role === "patient" ? "page" : undefined}>Patient</Link>
          <Link href={`/doctor/${register ? "register" : "login"}`} aria-current={role === "doctor" ? "page" : undefined}>Doctor</Link>
        </div>
        {!register && <span className={styles.eyebrow}>{role.toUpperCase()} PORTAL</span>}<h1>{title}</h1>
        {state.status === "error" && <div className={styles.alert} role="alert"><p>{apiMessage(state.error)}</p><button type="button" onClick={reload}>Retry session</button></div>}
        {state.status === "ready" ? <div className={styles.notice}>
          <p>You are signed in as a {state.identity.role}. {state.identity.role !== role && "This portal is for a different account role."}</p>
          <Link href={state.identity.role === "doctor" ? "/doctor" : "/patient/profile"}>Open my account</Link>
          <button className={styles.secondary} onClick={() => void signOut().catch(() => setMessage("Could not sign out. Please try again."))}>Sign out to use another account</button>
        </div> : <>
          {message && <div className={styles.alert} role="alert" tabIndex={-1} ref={summary}>{message}</div>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {!created && <form onSubmit={submit} noValidate aria-busy={busy}>
            <div className={styles.fields}>
              {register && field("name", "Full name", "text", "name")}
              {field("email", "Email address", "email", "email")}
              {register && field("phone", "Phone number", "tel", "tel")}
              {register && role === "doctor" && <>{field("address", "Address", "text", "street-address")}{field("specialty", "Specialty")}</>}
              {field("password", "Password", showPassword ? "text" : "password", register ? "new-password" : "current-password")}
              {register && field("confirmation", "Confirm password", showPassword ? "text" : "password", "new-password")}
            </div>
            <label className={styles.showPassword}><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} /> Show password</label>
            {register && role === "doctor" && <div className={styles.certificate}><h2>Practice certificate</h2>
              {field("certificateName", "Certificate name")}{field("certificateIssuer", "Issuing organization")}{field("certificateNumber", "Certificate number")}
              <label className={styles.field} htmlFor="doctor-evidence">Supporting document
                <input id="doctor-evidence" type="file" accept=".pdf,image/png,image/jpeg,image/webp" disabled={busy}
                  onChange={event => { setEvidence(event.target.files?.[0] ?? null); setErrors(current => ({ ...current, evidence: "" })); setNotice(""); }}
                  aria-invalid={Boolean(errors.evidence)} aria-describedby={errors.evidence ? "error-evidence" : undefined} />
                {evidence && <span className={styles.fileName}>{evidence.name}</span>}
                {errors.evidence && <span className={styles.fieldError} id="error-evidence">{errors.evidence}</span>}
              </label>
            </div>}
            <button className={styles.primary} type="submit" disabled={busy || (!configured && !(register && role === "doctor")) || uncertain || (state.status === "loading" && !(register && role === "doctor"))}>
              {busy ? "Please wait…" : register && role === "doctor" ? "Review details" : register ? "Create account" : "Sign in"}
            </button>
          </form>}
          {(!register || created || uncertain) && <button className={styles.textButton} type="button" disabled={busy || !configured} onClick={() => void resend()}>Resend confirmation email</button>}
          <p className={styles.bottom}>{register ? "Already have an account?" : "New to Carely?"} <Link href={`/${role}/${register ? "login" : "register"}`}>{register ? "Sign in" : "Create an account"}</Link></p>
        </>}
      </div>
    </section>
  </main>;
}
