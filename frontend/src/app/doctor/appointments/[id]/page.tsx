import { notFound } from "next/navigation";
import { isUuid } from "@/lib/contract-api";
import { DoctorWorkspace } from "../../doctor-workspace";
export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <DoctorWorkspace appointmentId={id} />;
}
