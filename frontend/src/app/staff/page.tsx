"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { AppointmentStatus } from "@/lib/types";

type Row = { id: string; patientName: string; patientPhone: string; doctorName: string; clinicName: string; startAt: string; status: AppointmentStatus };
const transitions: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  requested: ["confirmed", "cancelled"], confirmed: ["checked_in", "cancelled"], checked_in: ["completed", "cancelled"],
};

export default function StaffPage() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createClient(url, anon) : null;
  }, []);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data }) => { if (active) setToken(data.session?.access_token || ""); });
    const { data } = client.auth.onAuthStateChange((_event, session) => { if (active) setToken(session?.access_token || ""); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);

  async function load(currentToken = token) {
    if (!currentToken) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/appointments", { headers: { Authorization: "Bearer " + currentToken }, cache: "no-store" });
      const data = await response.json() as { appointments?: Row[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Không tải được lịch hẹn");
      setRows(data.appointments || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi không xác định"); }
    finally { setBusy(false); }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setBusy(true); setError("");
    const { data, error: authError } = await client.auth.signInWithPassword({ email, password });
    setBusy(false); setPassword("");
    if (authError) { setError(authError.message); return; }
    const key = data.session?.access_token || "";
    setToken(key);
    await load(key);
  }

  async function update(id: string, status: AppointmentStatus) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/appointments/" + id, {
        method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Không cập nhật được lịch hẹn");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi không xác định"); }
    finally { setBusy(false); }
  }

  return <section className="column">
    <span className="eyebrow">Clinic operations</span><h1>Clinic Staff Dashboard</h1>
    <p className="subtle">Chỉ nhân viên thuộc phòng khám mới được truy cập lịch hẹn.</p>
    {!client ? <div className="muted-note">Hãy cấu hình Supabase để đăng nhập.</div> : !token ?
      <form className="card column" onSubmit={login} style={{ maxWidth: 450 }}>
        <h2>Staff login</h2>
        <div className="form-group"><label htmlFor="email">Email</label><input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button className="btn" disabled={busy}>Đăng nhập</button>
      </form> :
      <>
        <div className="flex-between"><h2>Lịch hẹn ({rows.length})</h2>
          <div><button className="btn secondary" onClick={() => load()} disabled={busy}>Tải lại</button>{" "}
            <button className="btn secondary" onClick={() => client.auth.signOut()}>Đăng xuất</button></div>
        </div>
        <div className="card table-wrap"><table className="data-table">
          <thead><tr><th>Bệnh nhân</th><th>Bác sĩ / Clinic</th><th>Lịch</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td>{row.patientName}<p>{row.patientPhone}</p></td><td>{row.doctorName}<p>{row.clinicName}</p></td>
            <td>{new Date(row.startAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td>
            <td>{row.status}</td>
            <td>{(transitions[row.status] || []).map(status =>
              <button key={status} className="btn secondary" disabled={busy} onClick={() => update(row.id, status)}>{status}</button>)}</td>
          </tr>)}</tbody>
        </table>{!rows.length && <p className="subtle">Chưa có lịch hẹn.</p>}</div>
      </>}
    {error && <div className="muted-note danger" role="alert">{error}</div>}
  </section>;
}
