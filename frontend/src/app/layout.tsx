import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth/auth-provider";

export const metadata: Metadata = {
  title: "Carely | Doctor Appointment Booking",
  description: "Patient appointment dashboard.",
};

export default function RootLayout({ children, booking }: Readonly<{ children: React.ReactNode; booking: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider>{children}{booking}</AuthProvider></body></html>;
}
