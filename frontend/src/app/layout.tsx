import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth/auth-provider";
import { AvatarPreviewProvider } from "./profile/avatar-preview";

export const metadata: Metadata = {
  title: "Carely | Doctor Appointment Booking",
  description: "Patient appointment dashboard.",
};

export default function RootLayout({ children, booking }: Readonly<{ children: React.ReactNode; booking: React.ReactNode }>) {
  return <html lang="en"><body><AvatarPreviewProvider><AuthProvider>{children}{booking}</AuthProvider></AvatarPreviewProvider></body></html>;
}
