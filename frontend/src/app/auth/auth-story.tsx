"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./auth.module.css";

const moments = [
  { title: "Care that feels personal.", accent: "Made for you.", caption: "Find the right people and the right time." },
  { title: "A calmer way to connect.", accent: "Always close.", caption: "Your next visit is one step closer." },
  { title: "More room for what matters.", accent: "Less friction.", caption: "Technology in service of better care." },
];

export function AuthStory() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % moments.length), 5000);
    return () => window.clearInterval(timer);
  }, []);
  return <aside className={styles.story}>
    <Link className={styles.brand} href="/" aria-label="Carely home"><span aria-hidden="true">✳</span> carely.</Link>
    <div className={styles.storyBody}>
      <span className={styles.eyebrow}>THOUGHTFUL CARE, MADE SIMPLE</span>
      <div className={styles.storySpotlight} key={index}>
        <h2>{moments[index].title}<br/><em>{moments[index].accent}</em></h2>
        <p>{moments[index].caption}</p>
      </div>
      <div className={styles.storyCard}>
        <span className={styles.symbol} aria-hidden="true">✦</span>
        <div><strong>One shared experience</strong><p>For patients and care professionals alike.</p></div>
      </div>
      <div className={styles.storyIndicators} aria-label="Highlights">
        {moments.map((moment, i) => <button type="button" key={moment.title}
          className={index === i ? styles.storyIndicatorActive : ""}
          aria-label={"Show highlight " + (i + 1)} aria-pressed={index === i}
          onClick={() => setIndex(i)} />)}
      </div>
      <span className={styles.orbitOne} aria-hidden="true" /><span className={styles.orbitTwo} aria-hidden="true" />
    </div>
    <small>Carely · Patient &amp; Doctor portal</small>
  </aside>;
}
