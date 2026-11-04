"use client";

import { useState } from "react";
import Link from "next/link";
import type { Doctor } from "@/lib/types";

type Message = { role: "patient" | "assistant"; text: string };
type Result = {
  reply: string; followUpRequired: boolean; specialty: string | null;
  doctors: Doctor[]; urgent: boolean; demoMode: boolean; mode: string; error?: string;
};

export function Consultation() {
  const [draft, setDraft] = useState("");
  const [patientMessages, setPatientMessages] = useState<string[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (message.length < 2 || busy) return;
    const updated = [...patientMessages, message];
    setBusy(true); setError(""); setDraft("");
    try {
      const response = await fetch("/api/consult", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await response.json() as Result;
      if (!response.ok) throw new Error(data.error || "Tư vấn không khả dụng");
      setPatientMessages(updated);
      setHistory(prev => [...prev, { role: "patient", text: message }, { role: "assistant", text: data.reply }]);
      setResult(data);
    } catch (e) {
      setDraft(message);
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally { setBusy(false); }
  }

  function reset() {
    setDraft(""); setPatientMessages([]); setHistory([]); setResult(null); setError("");
  }

  return <section className="card column" aria-label="Symptom consultation">
    <h2 style={{ margin: 0 }}>Trao đổi triệu chứng & tìm chuyên khoa</h2>
    <p className="subtle">Mẫu hội thoại giới hạn: hệ thống hỏi thêm một câu rồi đề xuất chuyên khoa. Không chẩn đoán bệnh.</p>
    <div className="column" aria-live="polite">
      {history.map((m, i) => <div key={i} style={{
        background: m.role === "assistant" ? "var(--soft)" : "var(--bg)",
        padding: 12, borderRadius: 10,
      }}><strong>{m.role === "patient" ? "Bạn" : "Trợ lý"}:</strong> {m.text}</div>)}
    </div>
    {!result?.urgent && (result === null || result.followUpRequired) &&
      <form className="search" onSubmit={send} style={{ marginTop: 0 }}>
        <input aria-label="Mô tả triệu chứng hoặc trả lời câu hỏi"
          placeholder="Ví dụ: Tôi bị nổi mẩn đỏ trên da" value={draft}
          maxLength={800} onChange={e => setDraft(e.target.value)} required />
        <button className="btn" disabled={busy || draft.trim().length < 2}>{busy ? "Đang xử lý" : "Gửi"}</button>
      </form>}
    {error && <p role="alert" style={{ color: "#a53b40" }}>{error}</p>}
    {result?.urgent && <div className="muted-note danger" role="alert">{result.reply}</div>}
    {result?.specialty && !result.urgent &&
      <div className="column">
        <div className="success">Chuyên khoa gợi ý: <strong>{result.specialty}</strong></div>
        {result.demoMode && <div className="muted-note">Bác sĩ demo, cần Supabase thật để đặt lịch.</div>}
        {result.doctors.map(d => <article className="card" key={d.id}>
          <span className="chip">{d.specialty}</span>
          <h3>{d.name}</h3>
          <p>{d.clinicName} — {d.district}</p>
          <Link className="btn" href={"/doctors/" + d.id + "/book"}>Chọn bác sĩ & xem lịch</Link>
        </article>)}
        {!result.doctors.length && <p>Chưa có bác sĩ phù hợp trong danh mục.</p>}
      </div>}
    {history.length > 0 && <button className="btn secondary" type="button" onClick={reset}>Bắt đầu lại</button>}
  </section>;
}
