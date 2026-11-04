"use client";

import { useCallback, useEffect, useState } from "react";

type StaffDoctor = { id: string; name: string; specialty: string; clinicName: string };
type StaffSlot = {
  id: string; doctorId: string; clinicId: string; startAt: string; endAt: string; available: boolean
};

const display = (date: string) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
}).format(new Date(date));

export function ScheduleManager({ token }: { token: string }) {
  const [doctors, setDoctors] = useState<StaffDoctor[]>([]);
  const [slots, setSlots] = useState<StaffSlot[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const headers = { Authorization: "Bearer " + token };
    const [doctorRes, slotRes] = await Promise.all([
      fetch("/api/staff/doctors", { headers, cache: "no-store" }),
      fetch("/api/staff/slots", { headers, cache: "no-store" }),
    ]);
    const dr = await doctorRes.json();
    const sl = await slotRes.json();
    if (!doctorRes.ok || !slotRes.ok) {
      throw new Error(dr.error || sl.error || "Không tải được lịch bác sĩ");
    }
    setDoctors(dr.doctors || []);
    setSlots(sl.slots || []);
  }, [token]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/staff/doctors", { headers: { Authorization: "Bearer " + token } }),
      fetch("/api/staff/slots", { headers: { Authorization: "Bearer " + token } }),
    ]).then(async ([a, b]) => {
      const da = await a.json(), db = await b.json();
      if (!a.ok || !b.ok) throw new Error(da.error || db.error || "Không tải được lịch");
      if (active) { setDoctors(da.doctors || []); setSlots(db.slots || []); }
    }).catch(e => { if (active) setError(String(e.message)); });
    return () => { active = false; };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!doctorId || !start) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      // datetime-local has no timezone; staff enters clinic local time (Vietnam UTC+7).
      const startDate = new Date(start + ":00+07:00");
      if (Number.isNaN(startDate.getTime())) throw new Error("Giờ khám không hợp lệ");
      const response = await fetch("/api/staff/slots", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId, startAt: startDate.toISOString(),
          endAt: new Date(startDate.getTime() + duration * 60_000).toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(response.status === 409 ? "Bác sĩ đã có lịch trùng giờ." :
          data.error || (response.status === 422 ? "Thông tin giờ khám không hợp lệ." : "Không lưu được slot."));
      }
      setNotice("Đã lưu lịch khám; patient có thể chọn slot này.");
      setStart("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được lịch"); }
    finally { setBusy(false); }
  }

  return <section className="card column">
    <div><h2 style={{ marginTop: 0 }}>Doctor Schedule Management</h2>
      <p className="subtle">Nhập slot cho bác sĩ thuộc phòng khám của bạn. Múi giờ: Việt Nam (UTC+7).</p></div>
    <form className="column" onSubmit={submit}>
      <div className="form-group"><label htmlFor="slot-doctor">Bác sĩ</label>
        <select id="slot-doctor" value={doctorId} onChange={e => setDoctorId(e.target.value)} required
          style={{ padding: 12, borderRadius: 9 }}>
          <option value="">Chọn bác sĩ</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialty} ({d.clinicName})</option>)}
        </select>
      </div>
      <div className="form-group"><label htmlFor="slot-start">Ngày và giờ bắt đầu (UTC+7)</label>
        <input id="slot-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required />
      </div>
      <div className="form-group"><label htmlFor="slot-duration">Thời lượng</label>
        <select id="slot-duration" value={duration} onChange={e => setDuration(Number(e.target.value))}
          style={{ padding: 12, borderRadius: 9 }}>
          <option value={30}>30 phút</option><option value={60}>60 phút</option>
        </select>
      </div>
      <button className="btn" type="submit" disabled={busy || !doctors.length}>
        {busy ? "Đang lưu..." : "Thêm slot khả dụng"}
      </button>
    </form>
    {error && <p role="alert" style={{ color: "#a53b40" }}>{error}</p>}
    {notice && <div role="status" className="success">{notice}</div>}
    <div className="flex-between"><h3>Lịch đã nhập ({slots.length})</h3>
      <button className="btn secondary" disabled={busy} onClick={() => load().catch(e => setError(e.message))}>Làm mới</button></div>
    <div className="table-wrap"><table className="data-table">
      <thead><tr><th>Bác sĩ</th><th>Thời gian</th><th>Tình trạng</th></tr></thead>
      <tbody>{slots.map(s => <tr key={s.id}>
        <td>{doctors.find(d => d.id === s.doctorId)?.name || s.doctorId}</td>
        <td>{display(s.startAt)}</td><td>{s.available ? "Còn trống" : "Đã được đặt"}</td>
      </tr>)}</tbody>
    </table>{!slots.length && <p className="subtle">Chưa có lịch hẹn tương lai.</p>}</div>
  </section>;
}
