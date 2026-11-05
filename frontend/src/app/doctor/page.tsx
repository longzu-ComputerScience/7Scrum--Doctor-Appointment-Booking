import { DoctorWorkspace } from "./doctor-workspace";
export default async function DoctorPage({ searchParams }: { searchParams: Promise<{ section?: string; preview?: string }> }) {
  const { section, preview } = await searchParams;
  const initialSection = section === "appointments" || section === "schedule" || section === "notifications" || section === "profile" ? section : "overview";
  return <DoctorWorkspace initialSection={initialSection} preview={preview === "1"} />;
}
