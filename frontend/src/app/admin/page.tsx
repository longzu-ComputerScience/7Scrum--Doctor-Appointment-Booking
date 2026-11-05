"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { type Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import styles from "./admin.module.css";

type DoctorApplication = {
  id: string;
  fullName: string;
  email: string;
  specialty: string;
  licenseNumber: string;
  hospital: string;
  experienceYears: number | null;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  bio: string;
  documents: string[];
  documentLinks?: { name: string; url: string }[];
};

type PageState = "checking" | "signed-out" | "verifying" | "authorized" | "denied" | "error";

export default function AdminPage() {
  const client = useMemo(() => getSupabaseBrowser(), []);

  const requestVersion = useRef(0);
  const [pageState, setPageState] = useState<PageState>(client ? "checking" : "signed-out");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<DoctorApplication[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DoctorApplication | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchApplications = useCallback(async (accessToken: string, initial = true) => {
    const version = ++requestVersion.current;
    if (initial) setPageState("verifying");
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/doctor-applications", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      if (response.status === 401 || response.status === 403) {
        setApplications([]);
        setPageState("denied");
        setError("Tài khoản không có quyền Admin hoặc phiên đăng nhập không hợp lệ.");
        return;
      }
      if (!response.ok) {
        throw new Error(`Không thể tải danh sách hồ sơ (HTTP ${response.status}).`);
      }
      const payload: { applications?: DoctorApplication[] } = await response.json();
      if (version !== requestVersion.current) return;
      if (!Array.isArray(payload.applications)) {
        throw new Error("Dữ liệu hồ sơ từ server không hợp lệ.");
      }
      setApplications(payload.applications.filter(item => item.status === "pending"));
      setPageState("authorized");
      setError("");
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setApplications([]);
      setPageState("error");
      setError(cause instanceof Error ? cause.message : "Không thể kết nối tới server.");
    } finally {
      if (version === requestVersion.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const handleSession = (session: Session | null) => {
      if (!active) return;
      requestVersion.current += 1;
      const accessToken = session?.access_token ?? null;
      setToken(accessToken);
      setSelected(null);
      if (accessToken) {
        void fetchApplications(accessToken);
      } else {
        setApplications([]);
        setPageState("signed-out");
        setError("");
      }
    };

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setPageState("signed-out");
        setError(sessionError.message);
      } else {
        handleSession(data.session);
      }
    });
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        handleSession(session);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client, fetchApplications]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setPassword("");
    setBusy(false);
  }

  async function signOut() {
    if (!client) return;
    setBusy(true);
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) setError(signOutError.message);
    setBusy(false);
  }

  async function review(decision: "approved" | "rejected") {
    if (!selected || !token || pageState !== "authorized" || busy) return;
    if (decision === "rejected" && !reason.trim()) {
      setActionError("Vui lòng nhập lý do từ chối.");
      return;
    }
    setActionError("");
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/doctor-applications/${encodeURIComponent(selected.id)}/review`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reason: reason.trim() || null }),
        },
      );
      if (!response.ok) {
        throw new Error(response.status === 409
          ? "Hồ sơ đã được xử lý. Vui lòng tải lại danh sách."
          : `Không thể xử lý hồ sơ (HTTP ${response.status}).`);
      }
      setSelected(null);
      setNotice(decision === "approved" ? "Đã duyệt hồ sơ." : "Đã từ chối hồ sơ.");
      await fetchApplications(token, false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setBusy(false);
    }
  }

  const pending = applications.filter(row => row.status === "pending");
  const visible = pending.filter(row =>
    [row.fullName, row.specialty, row.email, row.hospital]
      .join(" ").toLocaleLowerCase("vi")
      .includes(search.trim().toLocaleLowerCase("vi")),
  );
  const authorized = pageState === "authorized";

  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><span className={styles.brandMark}>✳</span> carely<span className={styles.adminLabel}>ADMIN</span></Link>
      <nav className={styles.headerActions}>
        <Link href="/">Về trang chủ</Link>
        {token && <button type="button" onClick={() => void signOut()} disabled={busy}>Đăng xuất</button>}
      </nav>
    </header>

    <main className={styles.main}>
      {pageState === "checking" || pageState === "verifying"
        ? <div className={styles.loading} role="status">Đang xác thực quyền Admin…</div>
        : !authorized && pageState !== "error"
          ? <section className={styles.login}>
              <div className={styles.loginSymbol}>✳</div>
              <span className={styles.eyebrow}>QUẢN TRỊ HỆ THỐNG</span>
              <h1>Đăng nhập Admin</h1>
              <p>Đăng nhập bằng tài khoản quản trị để xem và duyệt hồ sơ đăng ký bác sĩ.</p>
              <form onSubmit={signIn}>
                <label>Email<input type="email" autoComplete="username" value={email} required onChange={event => setEmail(event.target.value)} placeholder="admin@example.com" /></label>
                <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} required onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu" /></label>
                <button type="submit" className={styles.primary} disabled={busy || !client}>
                  {busy ? "Đang đăng nhập…" : "Đăng nhập"}
                </button>
              </form>
              {error && <p className={styles.error} role="alert">{error}</p>}
              {!client && <p className={styles.error}>Thiếu cấu hình Supabase ở frontend.</p>}
            </section>
          : pageState === "error"
            ? <section className={styles.failure}>
                <h1>Chưa thể tải hồ sơ</h1>
                <p role="alert">{error}</p>
                {token && <button type="button" className={styles.primary} onClick={() => void fetchApplications(token)}>Thử lại</button>}
              </section>
            : <section className={styles.content}>
                <div className={styles.heading}>
                  <div>
                    <span className={styles.eyebrow}>QUẢN LÝ ĐĂNG KÝ BÁC SĨ</span>
                    <h1>Hồ sơ chờ duyệt</h1>
                    <p>Kiểm tra thông tin bác sĩ và quyết định chấp thuận hoặc từ chối hồ sơ.</p>
                  </div>
                  <div className={styles.pendingCount}>
                    <strong>{pending.length}</strong><span>Hồ sơ đang chờ</span>
                  </div>
                </div>
                {notice && <div className={styles.success} role="status">{notice}<button onClick={() => setNotice("")} aria-label="Đóng thông báo">×</button></div>}
                <div className={styles.panel}>
                  <div className={styles.toolbar}>
                    <label className={styles.search}>
                      <span className={styles.visuallyHidden}>Tìm bác sĩ</span>
                      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, chuyên khoa, email…" />
                    </label>
                    <button type="button" className={styles.secondary} onClick={() => token && void fetchApplications(token, false)} disabled={refreshing}>↻ {refreshing ? "Đang tải…" : "Làm mới"}</button>
                  </div>
                  {pending.length === 0
                    ? <div className={styles.empty}>Không có hồ sơ bác sĩ nào đang chờ duyệt.</div>
                    : visible.length === 0
                      ? <div className={styles.empty}>Không tìm thấy hồ sơ phù hợp.</div>
                      : <div className={styles.tableScroll}>
                          <table className={styles.table}>
                            <thead><tr><th>BÁC SĨ</th><th>CHUYÊN KHOA</th><th>KINH NGHIỆM</th><th>NGÀY GỬI</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
                            <tbody>{visible.map(row => <tr key={row.id}>
                              <td><div className={styles.person}><span className={styles.initials}>{row.fullName.split(" ").slice(-2).map(word => word[0]).join("")}</span><span><strong>{row.fullName}</strong><small>{row.email}</small></span></div></td>
                              <td>{row.specialty}<small>{row.hospital}</small></td>
                              <td>{row.experienceYears == null ? "Chưa khai báo" : String(row.experienceYears) + " năm"}</td><td>{row.submittedAt}</td>
                              <td><span className={styles.status}>Chờ duyệt</span></td>
                              <td><button type="button" className={styles.reviewButton} onClick={() => { setSelected(row); setReason(""); setActionError(""); }}>Xem hồ sơ</button></td>
                            </tr>)}</tbody>
                          </table>
                        </div>}
                  <div className={styles.footer}>{visible.length} / {pending.length} hồ sơ chờ duyệt</div>
                </div>
              </section>}
    </main>

    {selected && authorized && <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Xét duyệt hồ sơ bác sĩ">
        <div className={styles.dialogTop}><span className={styles.eyebrow}>HỒ SƠ {selected.id}</span><button type="button" aria-label="Đóng" onClick={() => setSelected(null)}>×</button></div>
        <div className={styles.dialogIdentity}><span className={styles.initials}>{selected.fullName.split(" ").slice(-2).map(word => word[0]).join("")}</span><div><h2>{selected.fullName}</h2><p>{selected.specialty} · {selected.hospital}</p></div></div>
        <div className={styles.details}>
          <div><span>Email</span><strong>{selected.email}</strong></div>
          <div><span>Kinh nghiệm</span><strong>{selected.experienceYears} năm</strong></div>
          <div><span>Mã chứng chỉ</span><strong>{selected.licenseNumber}</strong></div>
          <div><span>Ngày đăng ký</span><strong>{selected.submittedAt}</strong></div>
        </div>
        <h3>Thông tin chuyên môn</h3><p className={styles.bio}>{selected.bio || "Chưa cung cấp thông tin."}</p>
        <h3>Tài liệu khai báo</h3>
        <div className={styles.documents}>{selected.documentLinks?.length
          ? selected.documentLinks.map(document => <a key={document.url} href={document.url}
              rel="noopener noreferrer" target="_blank">↗ Xem {document.name}</a>)
          : selected.documents.length
            ? <span>Tài liệu đã lưu an toàn. Chưa có liên kết xem hợp lệ.</span>
            : <span>Chưa có tài liệu.</span>}</div>
        <label className={styles.reason}>Ghi chú / lý do từ chối<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Nhập lý do nếu từ chối hồ sơ…" /></label>
        {actionError && <p className={styles.error} role="alert">{actionError}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.reject} disabled={busy} onClick={() => void review("rejected")}>Từ chối</button>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void review("approved")}>Duyệt hồ sơ</button>
        </div>
      </section>
    </div>}
  </div>;
}
