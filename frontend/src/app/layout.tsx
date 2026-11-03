import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "7Scrum | Doctor Appointment Booking",
  description: "Find doctors and book clinic appointments. Demo application.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <header className="site-header"><div className="header-inner">
          <Link className="brand" href="/">7Scrum <span>Doctor Booking</span></Link>
          <nav aria-label="Main navigation"><Link href="/">Tìm bác sĩ</Link><Link href="/staff">Clinic staff</Link></nav>
        </div></header>
        <main className="main">{children}</main>
        <footer className="site-footer">7Scrum MVP · Chỉ dùng dữ liệu minh họa · Không thay thế tư vấn hoặc cấp cứu y khoa</footer>
      </body>
    </html>
  );
}
