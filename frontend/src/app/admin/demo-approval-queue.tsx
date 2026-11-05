"use client";

import { useState } from "react";
import styles from "./admin.module.css";

type DemoApplication = {
  id: string;
  name: string;
  specialty: string;
  facility: string;
  district: string;
  submitted: string;
  license: string;
  documents: string[];
};

/** Illustrative records only. Never fetched from a protected API or stored anywhere. */
const applications: DemoApplication[] = [
  {
    id: "DEMO-001", name: "Bác sĩ Demo 01", specialty: "Da liễu",
    facility: "Phòng khám Minh họa A", district: "Thủ Đức", submitted: "05/11/2026",
    license: "GPHN-DEMO-001",
    documents: ["Giấy phép hành nghề (mẫu)", "Bằng cấp chuyên môn (mẫu)"],
  },
  {
    id: "DEMO-002", name: "Bác sĩ Demo 02", specialty: "Tim mạch",
    facility: "Phòng khám Minh họa B", district: "Quận 1", submitted: "04/11/2026",
    license: "GPHN-DEMO-002",
    documents: ["Giấy phép hành nghề (mẫu)", "Chứng chỉ chuyên khoa (mẫu)"],
  },
  {
    id: "DEMO-003", name: "Bác sĩ Demo 03", specialty: "Nhi khoa",
    facility: "Phòng khám Minh họa C", district: "Bình Thạnh", submitted: "03/11/2026",
    license: "GPHN-DEMO-003",
    documents: ["Giấy phép hành nghề (mẫu)", "Bằng cấp chuyên môn (mẫu)"],
  },
];

function InertReviewActions() {
  return <div className={styles.demoReviewActions}>
    <button type="button" className={styles.demoApprove} disabled title="Demo UI: chưa triển khai duyệt thật">
      Approve
    </button>
    <button type="button" className={styles.demoReject} disabled title="Demo UI: chưa triển khai từ chối thật">
      Reject
    </button>
  </div>;
}

export function DemoApprovalQueue() {
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<DemoApplication | null>(null);
  const matches = applications.filter(app =>
    [app.name, app.specialty, app.facility, app.district, app.id]
      .join(" ").toLocaleLowerCase("vi").includes(keyword.trim().toLocaleLowerCase("vi"))
  );

  return <>
    <div className={styles.demoSummary} aria-label="Demo approval statistics">
      <div><span>ĐƠN CHỜ DUYỆT</span><strong>{applications.length}</strong><small>Hồ sơ mẫu</small></div>
      <div><span>ĐÃ DUYỆT</span><strong>0</strong><small>Không có thay đổi thật</small></div>
      <div><span>TỪ CHỐI</span><strong>0</strong><small>Không có thay đổi thật</small></div>
    </div>
    <section className={styles.panel} aria-labelledby="demo-queue-title">
      <div className={styles.toolbar}>
        <div>
          <h2 id="demo-queue-title" className={styles.demoSectionTitle}>Hồ sơ bác sĩ chờ duyệt</h2>
          <p className={styles.demoSectionCaption}>Dữ liệu giả lập để trình bày giao diện và luồng xét duyệt.</p>
        </div>
        <label className={styles.search}>
          <span className={styles.visuallyHidden}>Tìm hồ sơ demo</span>
          <input type="search" placeholder="Tìm hồ sơ, chuyên khoa, cơ sở…" value={keyword}
            onChange={event => setKeyword(event.target.value)}/>
        </label>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead><tr><th>BÁC SĨ</th><th>CHUYÊN KHOA</th><th>NGÀY NỘP</th>
            <th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
          <tbody>{matches.map(app => <tr key={app.id}>
            <td><div className={styles.person}>
              <span className={styles.initials} aria-hidden="true">BS</span>
              <span><strong>{app.name}</strong><small>{app.facility}</small></span>
            </div></td>
            <td>{app.specialty}<small>{app.district}</small></td>
            <td>{app.submitted}</td>
            <td><span className={styles.demoPending}>Pending · Demo</span></td>
            <td><div className={styles.demoTableActions}>
              <button type="button" className={styles.reviewButton} onClick={() => setSelected(app)}>
                Xem chi tiết
              </button>
              <InertReviewActions />
            </div></td>
          </tr>)}</tbody>
        </table>
        {!matches.length && <div className={styles.empty}>Không tìm thấy hồ sơ demo phù hợp.</div>}
      </div>
      <div className={styles.footer}>{matches.length} / {applications.length} hồ sơ mô phỏng · Không truy cập bảng xét duyệt</div>
    </section>
    <div className={styles.demoHint} role="note">
      <strong>Luồng duyệt hồ sơ (demo):</strong> Admin xem thông tin và tài liệu, sau đó chọn Approve hoặc Reject.
      Hai nút được giữ lại để minh họa nhưng chưa thực hiện xử lý hoặc cập nhật database.
    </div>

    {selected && <div className={styles.overlay}
      onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Hồ sơ bác sĩ mô phỏng">
        <div className={styles.dialogTop}>
          <span className={styles.eyebrow}>APPLICATION REVIEW · DEMO</span>
          <button type="button" aria-label="Đóng" onClick={() => setSelected(null)}>×</button>
        </div>
        <div className={styles.dialogIdentity}>
          <span className={styles.initials} aria-hidden="true">BS</span>
          <div><h2>{selected.name}</h2><p>{selected.specialty} · {selected.id}</p></div>
        </div>
        <div className={styles.details}>
          <div><span>Tình trạng</span><strong>Pending (demo)</strong></div>
          <div><span>Ngày đăng ký</span><strong>{selected.submitted}</strong></div>
          <div><span>Giấy phép hành nghề</span><strong>{selected.license}</strong></div>
          <div><span>Cơ sở y tế</span><strong>{selected.facility}</strong></div>
          <div><span>Địa điểm</span><strong>{selected.district}</strong></div>
        </div>
        <h3>Tài liệu đính kèm (mẫu)</h3>
        <div className={styles.documents}>{selected.documents.map(doc =>
          <span key={doc}>▤ {doc}</span>)}</div>
        <p className={styles.demoActionExplanation}>
          Các tệp và thông tin trên là dữ liệu mô phỏng. Approve/Reject chưa kết nối
          backend, không cấp quyền và không ghi thay đổi vào Supabase.
        </p>
        <InertReviewActions />
      </section>
    </div>}
  </>;
}
