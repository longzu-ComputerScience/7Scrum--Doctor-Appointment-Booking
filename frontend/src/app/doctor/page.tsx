import type { Metadata } from "next";
import { DoctorDashboard } from "./doctor-dashboard";

export const metadata: Metadata = {
  title: "Doctor Dashboard | Carely",
  description: "Manage working schedule, appointments, and doctor profile.",
};

export default function DoctorPage() {
  return <DoctorDashboard />;
}
