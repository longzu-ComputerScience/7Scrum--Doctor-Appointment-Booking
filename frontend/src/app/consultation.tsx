"use client";

import { useEffect, useRef, useState } from "react";
import { apiMessage } from "@/lib/contract-api";
import { aiApiStatus, postConsultation, responseSource, type ConsultationResult, type AiApiStatus } from "@/lib/consultation-api";
import styles from "./consultation.module.css";

type Message = { role: "patient" | "assistant"; text: string; source?: string };

const aiStatusDetails: Record<AiApiStatus, string> = {
  unchecked: "Not checked yet. Send a message to verify whether an AI provider is responding.",
  checking: "Checking the current request. The indicator will light only after a valid AI reply.",
  connected: "Connected: the latest reply used a valid AI provider response. The API does not identify which provider was used.",
  fallback: "The latest reply used local fallback, not an AI provider. Check your Gemini key and provider selection on Render.",
  error: "The request failed. AI connectivity has not been confirmed for this reply.",
};

export function Consultation({ onExploreSpecialty, canExploreDoctors = true }: {
  onExploreSpecialty?: (specialty: string) => void;
  canExploreDoctors?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [submittedMessages, setSubmittedMessages] = useState<string[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAiDetails, setShowAiDetails] = useState(false);
  const sending = useRef(false);
  const conversation = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [history.length, busy]);

  async function submit(message: string, retry = false) {
    const clean = message.trim();
    if (sending.current || (pending !== null && !retry)) return;
    if (clean.length < 2 || clean.length > 800) {
      setError("Please enter between 2 and 800 characters.");
      return;
    }
    if (submittedMessages.length >= 4) {
      setError("This conversation has reached its limit. Start a new one to continue.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    if (!retry) {
      setPending(clean);
      setHistory(previous => [...previous, { role: "patient", text: clean }]);
      setDraft("");
    }
    try {
      const nextMessages = [...submittedMessages, clean];
      const answer = await postConsultation(nextMessages);
      setSubmittedMessages(nextMessages);
      setHistory(previous => [...previous, { role: "assistant", text: answer.reply, source: responseSource(answer) }]);
      setResult(answer);
      setPending(null);
    } catch (cause) {
      setError(apiMessage(cause));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function reset() {
    if (sending.current) return;
    setDraft("");
    setSubmittedMessages([]);
    setHistory([]);
    setPending(null);
    setResult(null);
    setError("");
  }

  const canContinue = !result || (result.followUpRequired && !result.urgent && submittedMessages.length < 4);
  const aiStatus = aiApiStatus(result, busy, Boolean(error));
  const aiConfirmed = aiStatus === "connected";

  return <section className={styles.consultation} aria-label="Symptom consultation">
    <div className={styles.intro}>
      <span className={styles.kicker}>SYMPTOM CONSULTATION</span>
      <div className={styles.headingRow}>
        <h2>Tell us how you feel.</h2>
        <button type="button"
          className={`${styles.aiStatusButton} ${aiConfirmed ? styles.aiStatusConnected : ""}`}
          aria-label={`AI API: ${aiConfirmed ? "connected on last reply" : aiStatus}. Show details`}
          aria-expanded={showAiDetails}
          aria-controls="consultation-ai-status-details"
          onClick={() => setShowAiDetails(open => !open)}
          title={aiStatusDetails[aiStatus]}>
          <span className={styles.aiStatusDot} aria-hidden="true" />AI API
        </button>
      </div>
      <p>We can ask a follow-up question and suggest a specialty. This is guidance, not a medical diagnosis.</p>
      {showAiDetails && <p id="consultation-ai-status-details" className={styles.aiDetails} role="status">
        {aiStatusDetails[aiStatus]}
      </p>}
    </div>

    <div ref={conversation} className={styles.conversation} aria-live="polite" aria-relevant="additions">
      {history.length === 0 && <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">✳</span>
        <strong>Start with your symptoms</strong>
        <p>Describe what you are experiencing. Your conversation stays in this page session.</p>
      </div>}
      {history.map((message, index) => <div key={index} className={`${styles.message} ${message.role === "patient" ? styles.patient : styles.assistant}`}>
        <span className={styles.author}>{message.role === "patient" ? "You" : "Carely assistant"}</span>
        <p>{message.text}</p>
        {message.source && <small>Source: {message.source}</small>}
      </div>)}
      {busy && <p className={styles.loading} role="status">Reviewing your message…</p>}
    </div>

    {result?.urgent && <div className={styles.urgent} role="alert">
      <strong>Seek urgent care</strong>
      <p>{result.reply}</p>
    </div>}

    {result?.specialty && !result.urgent && <div className={styles.recommendation}>
      <span>Suggested specialty</span>
      <strong>{result.specialty}</strong>
      <p>This suggestion is for finding a relevant doctor. It is not a diagnosis.</p>
      {result.demoMode && <p>Doctor catalog data may be a demo until the service is configured.</p>}
      {onExploreSpecialty && <button type="button" onClick={() => onExploreSpecialty(result.specialty!)}>
        {canExploreDoctors ? "Find doctors in this specialty" : "Sign in to find doctors"}
      </button>}
    </div>}

    {error && <div className={styles.error} role="alert"><span>{error}</span>{pending && <button type="button" onClick={() => void submit(pending, true)} disabled={busy}>Retry sending</button>}</div>}

    {canContinue && pending === null && <form className={styles.composer} onSubmit={event => { event.preventDefault(); void submit(draft); }}>
      <label htmlFor="consultation-message">{result?.followUpRequired ? "Your follow-up answer" : "Describe your symptoms"}</label>
      <div><textarea id="consultation-message" value={draft} onChange={event => setDraft(event.target.value)}
        placeholder={result?.followUpRequired ? "Answer the assistant’s question…" : "For example: I have a skin rash that started yesterday…"}
        minLength={2} maxLength={800} rows={2} disabled={busy} />
        <button type="submit" disabled={busy || !draft.trim()}>Send</button></div>
      <small>{draft.length}/800 characters · Do not include private identifiers.</small>
    </form>}
    {result?.followUpRequired && submittedMessages.length >= 4 && <p className={styles.limit}>This conversation has reached its limit. Start a new one to continue.</p>}
    {history.length > 0 && <button className={styles.reset} type="button" onClick={reset} disabled={busy}>Start a new conversation</button>}
  </section>;
}
