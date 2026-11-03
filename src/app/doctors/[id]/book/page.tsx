import BookingClient from "./booking-client";
export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingClient doctorId={id} />;
}
