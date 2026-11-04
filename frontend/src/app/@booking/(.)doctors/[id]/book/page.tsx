import BookingClient from "@/app/doctors/[id]/book/booking-client";

export default async function BookingModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingClient key={id} doctorId={id} intercepted />;
}
