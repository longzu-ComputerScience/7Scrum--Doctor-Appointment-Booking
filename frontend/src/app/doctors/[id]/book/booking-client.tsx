"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppointmentSlot, Doctor } from "@/lib/types";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export default function BookingClient({ doctorId }: { doctorId: string }) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [demo, setDemo] = useState(false);
  const [slotId, setSlotId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const [doctorRes, slotRes] = await Promise.all([
      fetch("/api/doctors/" + doctorId), fetch("/api/doctors/" + doctorId + "/slots"),
    ]);
    if (!doctorRes.ok || !slotRes.ok) throw new Error("Không tải được bác sĩ hoặc lịch khám.");
    const doc = await doctorRes.json() as { doctor: Doctor; demoMode: boolean };
    const available = await slotRes.json() as { slots: AppointmentSlot[]; demoMode: boolean };
    setDoctor(doc.doctor); setSlots(available.slots); setDemo(doc.demoMode || available.demoMode);
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/doctors/" + doctorId), fetch("/api/doctors/" + doctorId + "/slots")])
      .then(async ([docRes, slotsRes]) => {
        if (!docRes.ok || !slotsRes.ok) throw new Error("Không tải được lịch khám.");
        const doc = await docRes.json() as { doctor: Doctor; demoMode: boolean };
        const avail = await slotsRes.json() as { slots: AppointmentSlot[]; demoMode: boolean };
        if (active) { setDoctor(doc.doctor); setSlots(avail.slots); setDemo(doc.demoMode || avail.demoMode); }
      }).catch((err) => { if (active) setError(String(err.message)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [doctorId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slotId || demo) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, patientName: name, patientPhone: phone, notes }),
      });
      const data = await response.json() as { bookingReference?: string; error?: string };
      if (!response.ok) {
        if (response.status === 409) { setSlotId(""); await refresh(); }
        throw new Error(response.status === 409 ? "Khung giờ vừa được người khác đặt. Hãy chọn giờ khác." : (data.error || "Không thể đặt lịch."));
      }
      setSuccess(data.bookingReference || "");
      setSlotId("");
    } catch (err) { setError(err instanceof Error ? err.message : "Có lỗi xảy ra."); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="column">
      <Link className="back-link" href="/">← Quay lại danh sách bác sĩ</Link>
      {loading ? <p>Đang tải...</p> : !doctor ? <p>Không tìm thấy bác sĩ.</p> : <>
        <div className="card">
          <span className="chip">{doctor.specialty}</span>
          <h1 style={{ marginTop: 0 }}>{doctor.name}</h1>
          <p>{doctor.clinicName} · {doctor.clinicAddress}</p>
          <p className="subtle">{doctor.bio}</p>
        </div>
        {demo && <div className="muted-note">Demo mode: xem trước slot minh họa; nút xác nhận booking bị tắt cho đến khi cấu hình Supabase.</div>}
        {success ? <div className="success" role="status"><h2>Đặt lịch đã được xác nhận</h2><p>Mã tham chiếu: <strong>{success}</strong></p><p>Vui lòng lưu mã này và đến phòng khám đúng giờ.</p><Link href="/">Tìm bác sĩ khác</Link></div> : (
          <form className="card column" onSubmit={submit}>
            <h2 style={{ margin: 0 }}>1. Chọn khung giờ</h2>
            <div className="slot-list" role="group" aria-label="Available appointment times">
              {slots.map((slot) => <button key={slot.id} type="button" className={"slot" + (slotId === slot.id ? " selected" : "")}
                aria-pressed={slotId === slot.id} onClick={() => setSlotId(slot.id)}>
                  {formatDate(slot.startAt)}
                </button>)}
            </div>
            {!slots.length && <p className="subtle">Hiện không có khung giờ trống. Vui lòng chọn bác sĩ khác.</p>}
            <h2 style={{ marginBottom: 0 }}>2. Thông tin đặt lịch</h2>
            <div className="form-group"><label htmlFor="patient-name">Họ và tên *</label><input id="patient-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required /></div>
            <div className="form-group"><label htmlFor="patient-phone">Số điện thoại *</label><input id="patient-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={9} maxLength={20} required /></div>
            <div className="form-group"><label htmlFor="patient-notes">Ghi chú (không nhập thông tin sức khỏe nhạy cảm)</label><textarea id="patient-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} /></div>
            {error && <p role="alert" style={{ color: "#a53b40" }}>{error}</p>}
            <button className="btn" disabled={!slotId || submitting || demo} type="submit">{submitting ? "Đang xác nhận..." : "Gửi yêu cầu đặt lịch"}</button>
            <p className="subtle">Slot được kiểm tra lại trong database khi xác nhận. Booking không đảm bảo nếu đã có người chọn trước.</p>
          </form>
        )}
      </>}
      {error && !doctor && <p role="alert">{error}</p>}
    </section>
  );
}
