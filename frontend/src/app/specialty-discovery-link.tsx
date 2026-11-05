import Link from "next/link";
import { recommendationHref, type SpecialtyRecommendation } from "@/lib/specialty-handoff";

/** FE1 #48 supplies only recommendation context. Doctors are always reloaded from the catalog. */
export function SpecialtyDiscoveryLink({ recommendation }: { recommendation: SpecialtyRecommendation }) {
  const href = recommendationHref(recommendation);
  return href ? <Link className="primary-button" href={href}>View matching doctors</Link> : null;
}
