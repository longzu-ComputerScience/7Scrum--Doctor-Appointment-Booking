"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import styles from "./admin.module.css";

type ReviewStatus = "pending" | "approved" | "rejected";
type Application = {
  id: string; fullName: string; email: string; specialty: string; licenseNumber: string;
  hospital: string; experienceYears: number; submittedAt: string; status: ReviewStatus;
  bio: string; documents: string[]; reviewNote?: string;
};
const demoApplications: Application[] = [
  { id:"APP-2026-041", fullName:"Nguyễn Minh Anh",email:"minhanh@example.test",specialty:"Tim mạch",licenseNumber:"VN-CCHN-2024-0842",hospital:"Bệnh viện Đại học Y Dược",experienceYears:8,submittedAt:"2026-11-05",status:"pending",bio:"Bác sĩ chuyên khoa Tim mạch, tập trung tư vấn và khám ngoại trú.",documents:["Chứng chỉ hành nghề","Bằng tốt nghiệp","Giấy xác nhận công tác"] },
  { id:"APP-2026-040", fullName:"Trần Quốc Bảo",email:"quocbao@example.test",specialty:"Da liễu",licenseNumber:"VN-CCHN-2023-0193",hospital:"Phòng khám chuyên khoa",experienceYears:6,submittedAt:"2026-11-04",status:"pending",bio:"Chuyên điều trị da liễu tổng quát.",documents:["Chứng chỉ hành nghề","Bằng tốt nghiệp"] },
  { id:"APP-2026-039", fullName:"Lê Thảo Vy",email:"thaovy@example.test",specialty:"Nhi khoa",licenseNumber:"VN-CCHN-2022-0561",hospital:"Bệnh viện Nhi Đồng",experienceYears:10,submittedAt:"2026-11-02",status:"approved",bio:"Chuyên khám nhi và tư vấn sức khỏe trẻ em.",documents:["Chứng chỉ hành nghề","Bằng chuyên khoa"] },
  { id:"APP-2026-038", fullName:"Phạm Gia Huy",email:"giahuy@example.test",specialty:"Nội tổng quát",licenseNumber:"VN-CCHN-2025-0274",hospital:"Phòng khám tư nhân",experienceYears:3,submittedAt:"2026-11-01",status:"rejected",bio:"Khám nội khoa và tư vấn sức khỏe.",documents:["Bằng tốt nghiệp"],reviewNote:"Cần bổ sung chứng chỉ hành nghề hợp lệ." }
];

export default function AdminPage() {
  const client = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [token, setToken] = useState<string | null>(null);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [authError,setAuthError] = useState("");
  const [busy,setBusy] = useState(false);
  const [demo,setDemo] = useState(false);
  const [records,setRecords] = useState<Application[]>([]);
  const [tab,setTab] = useState<"all"|ReviewStatus>("pending");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<Application | null>(null);
  const [note,setNote] = useState("");
  const [notice,setNotice] = useState("");
  const [loading,setLoading] = useState(false);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/doctor-applications", {
        headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store"
      });
      if (!res.ok) throw new Error(res.status===403 ? "Access denied: account is not an administrator." : `Unable to load applications (HTTP ${res.status}).`);
      const data: {applications:Application[]} = await res.json();
      setRecords(data.applications);
      setAuthError("");
    } catch (err) { setAuthError(err instanceof Error ? err.message : "Cannot load applications."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!client) return;
    let active=true;
    client.auth.getSession().then(({data}) => {
      if (!active) return;
      const t=data.session?.access_token ?? null;
      setToken(t);
      if(t) void load(t);
    });
    const {data:subscription}=client.auth.onAuthStateChange((_event,session)=>{
      if (!active) return;
      const t=session?.access_token??null;
      setToken(t);
      if(t && !demo) void load(t);
    });
    return ()=>{active=false;subscription.subscription.unsubscribe();};
  },[client,load,demo]);

  async function signIn(e:React.FormEvent) {
    e.preventDefault();
    if(!client) {setAuthError("Supabase frontend environment is missing.");return;}
    setBusy(true);setAuthError("");
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error)setAuthError(error.message);
    setBusy(false);setPassword("");
  }
  function enterDemo() {setDemo(true);setRecords(demoApplications);setAuthError("");setTab("pending");}
  function exitDemo() {setDemo(false);setSelected(null);setRecords([]);}
  async function review(status:"approved"|"rejected") {
    if(!selected)return;
    if(status==="rejected"&&!note.trim()) {setNotice("Please provide a rejection reason.");return;}
    setBusy(true);setNotice("");
    if (demo) {
      setRecords(prev=>prev.map(row=>row.id===selected.id?{...row,status,reviewNote:note.trim()}:row));
      setSelected(null);setNotice(`Demo only: ${selected.fullName} marked as ${status}. Nothing was saved to Supabase.`);
    } else {
      try {
        const res=await fetch(`/api/admin/doctor-applications/${encodeURIComponent(selected.id)}/review`,{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
          body:JSON.stringify({decision:status,reason:note.trim()||null})
        });
        if(!res.ok)throw new Error(`Review failed (HTTP ${res.status}).`);
        setSelected(null);setNotice("Review saved.");if(token)await load(token);
      } catch(err) {setNotice(err instanceof Error?err.message:"Review failed.");}
    }
    setBusy(false);
  }
  const shown=records.filter(row=>(tab==="all"||row.status===tab)&&`${row.fullName} ${row.specialty} ${row.email}`.toLowerCase().includes(query.toLowerCase()));
  const count=(s:ReviewStatus)=>records.filter(row=>row.status===s).length;
  const workspace=demo||Boolean(token);
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span className={styles.mark}>✳</span> carely<span className={styles.brandTag}>ADMIN</span></Link>
      <p className={styles.navLabel}>WORKSPACE</p>
      <div className={styles.navActive}>▦ <span>Doctor applications</span>{count("pending")>0&&<b>{count("pending")}</b>}</div>
      <div className={styles.navMuted}>◫ <span>Doctor directory</span><small>Coming soon</small></div>
      <div className={styles.navMuted}>◷ <span>Audit history</span><small>Coming soon</small></div>
      <div className={styles.sidebarBottom}><span className={styles.secure}>♧ Role-restricted workspace</span><Link href="/">← Patient portal</Link>{demo?<button onClick={exitDemo}>Exit demo</button>:token?<button onClick={()=>void client?.auth.signOut()}>Sign out</button>:null}</div>
    </aside>
    <main className={styles.main}>
      <header className={styles.topbar}><div><span className={styles.eyebrow}>ADMINISTRATION / CREDENTIALING</span><h1>Doctor verification</h1><p>Review new applications and keep your medical network trusted.</p></div><div className={styles.avatar}>AD</div></header>
      {demo&&<div className={styles.demoBanner}><b>Preview mode</b> — All profiles and documents are fictional. Decisions are local and are never written to the database. <button onClick={()=>{setRecords(demoApplications);setNotice("");}}>Reset preview</button></div>}
      {notice&&<div className={styles.message} role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
      {!workspace?<section className={styles.access}>
        <span className={styles.accessIcon}>♧</span><h2>Administrator sign in</h2><p>Use your authorized account to review doctor credentials and applications.</p>
        <form onSubmit={signIn}><label>Email<input type="email" value={email} required onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com"/></label><label>Password<input type="password" value={password} required onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label><button disabled={busy} className={styles.primary}>{busy?"Signing in…":"Sign in securely"}</button></form>
        {authError&&<p className={styles.error} role="alert">{authError}</p>}
        <div className={styles.demoEntry}><span>Want to explore the interface first?</span><button onClick={enterDemo}>View interactive demo →</button></div>
      </section>:<>
        {authError&&<div className={styles.error} role="alert">{authError}</div>}
        <section className={styles.metrics}>
          <div><span>Awaiting review</span><strong>{count("pending")}</strong><small>Action required</small></div>
          <div><span>Approved</span><strong>{count("approved")}</strong><small>Verified applications</small></div>
          <div><span>Rejected</span><strong>{count("rejected")}</strong><small>Additional verification needed</small></div>
          <div><span>Total applications</span><strong>{records.length}</strong><small>Across all statuses</small></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>APPLICATION QUEUE</span><h2>Credential review</h2><p>Check professional details before making an approval decision.</p></div><button className={styles.refresh} onClick={()=>demo?setRecords(demoApplications):token&&void load(token)}>↻ Refresh</button></div>
          <div className={styles.controls}><div className={styles.tabs}>{(["pending","approved","rejected","all"] as const).map(s=><button key={s} className={tab===s?styles.tabActive:""} onClick={()=>setTab(s)}>{s[0].toUpperCase()+s.slice(1)} <span>{s==="all"?records.length:count(s)}</span></button>)}</div><input aria-label="Search applications" placeholder="⌕ Search name, specialty, email…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
          {loading?<div className={styles.empty}>Loading applications…</div>:shown.length===0?<div className={styles.empty}>No applications match this view.</div>:<div className={styles.tableWrap}><table><thead><tr><th>DOCTOR</th><th>SPECIALTY</th><th>EXPERIENCE</th><th>SUBMITTED</th><th>STATUS</th><th></th></tr></thead><tbody>{shown.map(row=><tr key={row.id}><td><div className={styles.person}><span className={styles.initials}>{row.fullName.split(" ").slice(-2).map(p=>p[0]).join("")}</span><div><b>{row.fullName}</b><small>{row.email}</small></div></div></td><td>{row.specialty}<small>{row.hospital}</small></td><td>{row.experienceYears} years</td><td>{row.submittedAt}</td><td><span className={`${styles.status} ${styles[row.status]}`}>● {row.status}</span></td><td><button className={styles.reviewButton} onClick={()=>{setSelected(row);setNote(row.reviewNote??"");setNotice("");}}>Review →</button></td></tr>)}</tbody></table></div>}
          <div className={styles.tableFooter}>Showing {shown.length} of {records.length} applications {demo?"· Sample data":"· Live server data"}</div>
        </section>
      </>}
    </main>
    {selected&&<div className={styles.overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section role="dialog" aria-modal="true" aria-label="Application review" className={styles.dialog}><div className={styles.dialogTop}><span className={styles.eyebrow}>APPLICATION {selected.id}</span><button aria-label="Close" onClick={()=>setSelected(null)}>×</button></div><div className={styles.dialogIdentity}><span className={styles.initials}>{selected.fullName.split(" ").slice(-2).map(p=>p[0]).join("")}</span><div><h2>{selected.fullName}</h2><p>{selected.specialty} · {selected.hospital}</p></div></div><div className={styles.detailGrid}><div><small>Email</small><b>{selected.email}</b></div><div><small>Experience</small><b>{selected.experienceYears} years</b></div><div><small>License number</small><b>{selected.licenseNumber}</b></div><div><small>Submitted on</small><b>{selected.submittedAt}</b></div></div><h3>Professional profile</h3><p className={styles.bio}>{selected.bio}</p><h3>Supporting documents</h3><div className={styles.documents}>{selected.documents.map(doc=><span key={doc}>▤ {doc}{demo?" · Sample label":""}</span>)}</div>{selected.status==="pending"?<><label className={styles.note}>Review note / rejection reason<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Explain missing credentials or the reason for rejection…"/></label><div className={styles.actions}><button disabled={busy} className={styles.reject} onClick={()=>void review("rejected")}>Reject application</button><button disabled={busy} className={styles.primary} onClick={()=>void review("approved")}>✓ Approve doctor</button></div></>:<div className={styles.resolved}>This application is {selected.status}.{selected.reviewNote?` Note: ${selected.reviewNote}`:""}</div>}<p className={styles.dialogHint}>{demo?"Preview mode: decisions are not persisted.":"Only authorized administrators can submit a decision."}</p></section></div>}
  </div>;
}
