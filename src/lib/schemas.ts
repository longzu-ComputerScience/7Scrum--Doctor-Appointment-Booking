import { z } from "zod";
export const uuid = z.string().uuid();
export const assistantInput = z.object({ message: z.string().trim().min(2).max(800) });
export const bookingInput = z.object({
  slotId: uuid,
  patientName: z.string().trim().min(2).max(100),
  patientPhone: z.string().trim().regex(/^\+?[0-9 ()-]{9,20}$/, "Invalid phone number"),
  notes: z.string().trim().max(500).optional().default(""),
});
export const staffStatusInput = z.object({
  status: z.enum(["confirmed", "checked_in", "completed", "cancelled"]),
});
