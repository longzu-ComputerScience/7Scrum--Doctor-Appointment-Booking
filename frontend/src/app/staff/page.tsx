import { redirect } from "next/navigation";

/** Legacy staff route retired in favor of the role-restricted Admin portal. */
export default function LegacyStaffRedirect() {
  redirect("/admin");
}
