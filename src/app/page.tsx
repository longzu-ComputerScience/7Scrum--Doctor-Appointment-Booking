"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Doctor } from "@/lib/types";

type SearchResponse = { doctors: Doctor[]; demoMode: boolean; message?: string; urgent?: boolean; usedAI?: boolean; error?: string };

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [usedAI, setUsedAI] = useState(false);

  useEffect(() => {
    fetch("/api/doctors").then((res) => res.json()).then((data: SearchResponse) => {
      setDoctors(data.doctors || []); setDemoMode(Boolean(data.demoMode));
    }).catch(() => setMessage("Không tải được danh sách bác sĩ.")).finally(() => setLoading(false));
  }, []);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query.trim() }),
      });
      const data = await response.json() as SearchResponse;
      if (!response.ok) throw new Error(data.error || "Search failed");
      setDoctors(data.doctors || []); setDemoMode(Boolean(data.demoMode));
      setMessage(data.message || ""); setUsedAI(Boolean(data.usedAI));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tìm bác sĩ.");
    } finally { setLoading(false); }
  }

  return (
    <>
      <section className="hero">
        <span className="eyebrow">Find care, book with confidence</span>
        <h1>Tìm bác sĩ và đặt lịch khám dễ dàng</h1>
        <p>Nhập chuyên khoa, khu vực hoặc mô tả nhu cầu khám. Hệ thống chỉ trả về bác sĩ trong danh mục có sẵn; không đưa ra chẩn đoán.</p>
        <form className="search" onSubmit={search}>
          <input aria-label="Nhập nhu cầu khám" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Ví dụ: Tìm bác sĩ da liễu ở Thủ Đức" maxLength={800} required />
          <button className="btn" disabled={loading || query.trim().length < 2} type="submit">{loading ? "Đang tìm..." : "Tìm bác sĩ"}</button>
        </form>
      </section>
      {demoMode && <div className="muted-note">Demo mode: thông tin bác sĩ/phòng khám chỉ là minh họa; cần cấu hình Supabase để đặt lịch thật.</div>}
      {message && <div className={"muted-note" + (doctors.length === 0 ? " danger" : "")} role="status">{message}</div>}
      <div className="flex-between"><h2>Danh sách bác sĩ ({doctors.length})</h2><span className="subtle">{usedAI ? "AI-assisted filtering" : "Catalog search"}</span></div>
      {loading ? <p className="subtle">Đang tải dữ liệu...</p> : (
        <div className="grid">
          {doctors.map((doctor) => <article key={doctor.id} className="card">
            <span className="chip">{doctor.specialty}</span>
            <h3>{doctor.name}</h3>
            <p><strong>{doctor.clinicName}</strong> · {doctor.district}</p>
            <p>{doctor.clinicAddress}</p>
            <p>{doctor.bio}</p>
            <Link className="btn" href={"/doctors/" + doctor.id + "/book"}>Xem lịch & đặt khám</Link>
          </article>)}
          {!doctors.length && <p className="subtle">Chưa có bác sĩ phù hợp trong danh mục hiện tại.</p>}
        </div>
      )}
    </>
  );
}
