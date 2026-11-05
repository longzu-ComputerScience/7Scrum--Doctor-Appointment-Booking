"use client";

import Link from "next/link";
import type { Role } from "@/lib/fe1-api";
import styles from "./auth.module.css";

export function AuthStory({ role }: { role: Role }) {
  const isDoctor = role === "doctor";

  return <aside className={styles.story}>
    <Link className={styles.brand} href="/" aria-label="Carely home"><span aria-hidden="true">✳</span> carely.</Link>
    <div className={styles.storyBody}>
      <span className={styles.eyebrow}>THOUGHTFUL CARE, MADE SIMPLE</span>
      <div className={styles.storySpotlight} key={role}>
        <h2>{isDoctor
          ? <>More time for<br /><em>the people</em><br />you care for.</>
          : <>Expert care.<br /><em>A little closer.</em></>}</h2>
      </div>
      <div className={styles.storyCard}>
        <span className={styles.symbol} aria-hidden="true">{isDoctor ? "⌘" : "+"}</span>
        <div><strong>{isDoctor ? "Care on your schedule" : "Care that fits your day"}</strong></div>
      </div>
      <span className={styles.orbitOne} aria-hidden="true" /><span className={styles.orbitTwo} aria-hidden="true" />
    </div>
    <small>Carely · Patient &amp; Doctor portal</small>
  </aside>;
}
