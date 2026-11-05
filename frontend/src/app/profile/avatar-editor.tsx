"use client";

import { useState, type ChangeEvent } from "react";
import { useAvatarPreview } from "./avatar-preview";
import styles from "./avatar-editor.module.css";

type Props = { userId: string; name: string };

export function AvatarEditor({ userId, name }: Props) {
  const { avatarFor, preview } = useAvatarPreview();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const avatarUrl = avatarFor(userId);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP image under 2 MB.");
      return;
    }
    // A browser-only visual preview, not a saved profile photo.
    preview(userId, file);
    setNotice("Preview updated for this visit only.");
  }

  return <div className={styles.editor}>
    <span className={styles.avatar} role="img" aria-label={name + "'s avatar"}
      style={avatarUrl ? { backgroundImage: "url(" + JSON.stringify(avatarUrl) + ")" } : undefined}>
      {avatarUrl ? null : name.trim().slice(0, 1).toUpperCase()}
    </span>
    <div className={styles.controls}>
      <label className={styles.upload} htmlFor="profile-avatar-file">Preview profile photo
        <input id="profile-avatar-file" type="file" accept="image/png,image/jpeg,image/webp"
          onChange={choose} />
      </label>
      <small>JPG, PNG or WebP · max 2 MB</small>
      <small>Temporary on this page session. Not saved to your account.</small>
      {notice && <span className={styles.notice} role="status">{notice}</span>}
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  </div>;
}
