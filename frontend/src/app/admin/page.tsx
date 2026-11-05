"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import styles from "./admin.module.css";

type DoctorRow = {
  id: string;
  name: string;
  specialty: string;
  active: boolean;
  bio: string;
  address: string;
  district: string;
  certificates: { name: string; issuer: string }[];
};

type PageState = "checking" | "signed-out" | "verifying" | "authorized" | "denied" | "error";
type StatusFilter = "all" | "active" | "inactive";

export default function AdminPage() {
  const client = useMemo(() => getSupabaseBrowser(), []);
  const requestVersion = useRef(0);
  const [pageState, setPageState] = useState<PageState>(client ? "checking" : "signed-out");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<DoctorRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDoctors = useCallback(async (accessToken: string, initial = true) => {
    const version = ++requestVersion.current;
    if (initial) setPageState("verifying");
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/doctors", {
        headers: { Authorization: "Bearer " + accessToken },
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      if (response.status === 401 || response.status === 403) {
        setDoctors([]);
        setPageState("denied");
        setError("Tài khoản này không có quyền Admin. Backend cần cấu hình ADMIN_USER_IDS.");
        return;
      }
      if (!response.ok) throw new Error("Không thể tải danh sách bác sĩ (HTTP " + response.status + ").");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("doctors" in result) ||
          !Array.isArray(result.doctors)) throw new Error("Dữ liệu bác sĩ không hợp lệ.");
      setDoctors(result.doctors as DoctorRow[]);
      setPageState("authorized");
      setError("");
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setDoctors([]);
      setPageState("error");
      setError(cause instanceof Error ? cause.message : "Không thể kết nối đến backend.");
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
        void fetchDoctors(accessToken);
      } else {
        setDoctors([]);
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
    return () => {
      active = false;
      requestVersion.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [client, fetchDoctors]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await client.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
    } catch {
      setError("Không thể đăng nhập. Vui lòng kiểm tra kết nối.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function signOut() {
    if (!client || busy) return;
    setBusy(true);
    try {
      const { error: authError } = await client.auth.signOut();
      if (authError) setError(authError.message);
    } finally {
      setBusy(false);
    }
  }

  const visible = doctors.filter(doctor => {
    const statusMatches = filter === "all" ||
      (filter === "active" ? doctor.active : !doctor.active);
    const text = [doctor.name, doctor.specialty, doctor.district, doctor.address]
      .join(" ").toLocaleLowerCase("vi");
    return statusMatches && text.includes(search.trim().toLocaleLowerCase("vi"));
  });
  const inactive = doctors.filter(row => !row.active).length;
  const authorized = pageState === "authorized";

  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark}>✳</span> carely
        <span className={styles.adminLabel}>ADMIN</span>
      </Link>
      <nav className={styles.headerActions}>
        <Link href="/">Về trang chủ</Link>
        {token && <button type="button" onClick={() => void signOut()} disabled={busy}>Đăng xuất</button>}
      </nav>
    </header>

    <main className={styles.main}>
      {pageState === "checking" || pageState === "verifying"
        ? <div className={styles.loading} role="status">Đang xác thực quyền truy cập…</div>
        : pageState === "denied"
          ? <section className={styles.failure}>
              <h1>Quyền truy cập bị từ chối</h1>
              <p role="alert">{error}</p>
              <button className={styles.primary} type="button" onClick={() => void signOut()} disabled={busy}>
                Đăng xuất để sử dụng tài khoản khác
              </button>
            </section>
          : pageState === "error"
            ? <section className={styles.failure}>
                <h1>Chưa thể tải dữ liệu</h1>
                <p role="alert">{error}</p>
                {token && <button className={styles.primary} type="button" onClick={() => void fetchDoctors(token)}>
                  Thử lại
                </button>}
              </section>
            : !authorized
              ? <section className={styles.login}>
                  <div className={styles.loginSymbol}>✳</div>
                  <span className={styles.eyebrow}>QUẢN TRỊ HỆ THỐNG</span>
                  <h1>Đăng nhập Admin</h1>
                  <p>Đăng nhập tài khoản đã được cấp quyền để xem danh sách bác sĩ hiện có.</p>
                  <form onSubmit={signIn}>
                    <label>Email
                      <input type="email" autoComplete="username" value={email} required
                        onChange={event => setEmail(event.target.value)} placeholder="Email Admin" />
                    </label>
                    <label>Mật khẩu
                      <input type="password" autoComplete="current-password" value={password} required
                        onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu" />
                    </label>
                    <button type="submit" className={styles.primary} disabled={busy || !client}>
                      {busy ? "Đang đăng nhập…" : "Đăng nhập"}
                    </button>
                  </form>
                  {error && <p className={styles.error} role="alert">{error}</p>}
                  {!client && <p className={styles.error}>Frontend chưa cấu hình Supabase Auth.</p>}
                </section>
              : <section className={styles.content}>
                  <div className={styles.heading}>
                    <div>
                      <span className={styles.eyebrow}>QUẢN TRỊ BÁC SĨ</span>
                      <h1>Danh sách bác sĩ</h1>
                      <p>Xem hồ sơ hiện có và tình trạng hoạt động của bác sĩ.</p>
                    </div>
                    <div className={styles.pendingCount}>
                      <strong>{doctors.length}</strong><span>Tổng bác sĩ</span>
                    </div>
                  </div>
                  <div className={styles.readOnlyNotice} role="note">
                    <strong>Chế độ chỉ xem</strong>
                    <span>Không thay đổi Supabase. Chức năng duyệt/từ chối đơn chưa khả dụng;
                      trạng thái không hoạt động không đồng nghĩa hồ sơ đang chờ duyệt.</span>
                  </div>
                  <div className={styles.panel}>
                    <div className={styles.toolbar}>
                      <label className={styles.search}>
                        <span className={styles.visuallyHidden}>Tìm kiếm bác sĩ</span>
                        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
                          placeholder="Tìm tên, chuyên khoa, địa chỉ, quận…" />
                      </label>
                      <label className={styles.filterSelect}>Trạng thái
                        <select value={filter} onChange={event => setFilter(event.target.value as StatusFilter)}>
                          <option value="all">Tất cả</option>
                          <option value="active">Đang hoạt động</option>
                          <option value="inactive">Chưa hoạt động ({inactive})</option>
                        </select>
                      </label>
                      <button type="button" className={styles.secondary}
                        onClick={() => token && void fetchDoctors(token, false)} disabled={refreshing}>
                        ↻ {refreshing ? "Đang tải…" : "Làm mới"}
                      </button>
                    </div>
                    {doctors.length === 0
                      ? <div className={styles.empty}>Chưa có hồ sơ bác sĩ trong database.</div>
                      : visible.length === 0
                        ? <div className={styles.empty}>Không tìm thấy bác sĩ phù hợp.</div>
                        : <div className={styles.tableScroll}>
                            <table className={styles.table}>
                              <thead><tr><th>BÁC SĨ</th><th>CHUYÊN KHOA</th><th>ĐỊA ĐIỂM</th>
                                <th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
                              <tbody>{visible.map(row => <tr key={row.id}>
                                <td><div className={styles.person}>
                                  <span className={styles.initials}>{row.name.split(" ").slice(-2).map(w => w[0]).join("")}</span>
                                  <span><strong>{row.name}</strong><small>{row.id}</small></span>
                                </div></td>
                                <td>{row.specialty}</td>
                                <td>{row.district}<small>{row.address}</small></td>
                                <td><span className={styles.status} data-active={row.active}>
                                  {row.active ? "Đang hoạt động" : "Chưa hoạt động"}
                                </span></td>
                                <td><button className={styles.reviewButton} type="button"
                                  onClick={() => setSelected(row)}>Xem chi tiết</button></td>
                              </tr>)}</tbody>
                            </table>
                          </div>}
                    <div className={styles.footer}>{visible.length} / {doctors.length} bác sĩ</div>
                  </div>
                </section>}
    </main>

    {selected && authorized && <div className={styles.overlay}
      onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Thông tin bác sĩ">
        <div className={styles.dialogTop}>
          <span className={styles.eyebrow}>DOCTOR PROFILE</span>
          <button type="button" aria-label="Đóng" onClick={() => setSelected(null)}>×</button>
        </div>
        <div className={styles.dialogIdentity}>
          <span className={styles.initials}>{selected.name.split(" ").slice(-2).map(w => w[0]).join("")}</span>
          <div><h2>{selected.name}</h2><p>{selected.specialty}</p></div>
        </div>
        <div className={styles.details}>
          <div><span>Trạng thái</span><strong>{selected.active ? "Đang hoạt động" : "Chưa hoạt động"}</strong></div>
          <div><span>Chuyên khoa</span><strong>{selected.specialty}</strong></div>
          <div><span>Quận</span><strong>{selected.district || "Chưa có"}</strong></div>
          <div><span>Địa chỉ</span><strong>{selected.address || "Chưa có"}</strong></div>
        </div>
        <h3>Giới thiệu</h3><p className={styles.bio}>{selected.bio || "Chưa có giới thiệu."}</p>
        <h3>Chứng chỉ được khai báo</h3>
        <div className={styles.documents}>
          {selected.certificates.length
            ? selected.certificates.map((cert, i) =>
                <span key={i}>{cert.name}{cert.issuer ? " · " + cert.issuer : ""}</span>)
            : <span>Chưa có thông tin chứng chỉ.</span>}
        </div>
        <p className={styles.readOnlyNotice}>Không thể Approve/Reject trong chế độ không thay đổi database.</p>
      </section>
    </div>}
  </div>;
}
