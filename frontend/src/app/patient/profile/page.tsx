import Link from "next/link";
import { PatientProfileView } from "./patient-profile";
export default function PatientProfilePage() {
  return <main style={{ padding: "28px 20px", minHeight: "100vh" }}><Link href="/">Back to dashboard</Link><PatientProfileView /></main>;
}
