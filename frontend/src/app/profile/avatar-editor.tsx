"use client";

import { useState, type ChangeEvent } from "react";
import { fe1Request } from "@/lib/fe1-api";
import { isRecord } from "@/lib/contract-api";
import styles from "./avatar-editor.module.css";

type Props = { token: string; name: string; avatarUrl?: string | null; onSaved: () => void };

export function AvatarEditor({ token, name, avatarUrl, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setNotice("");
    event.target.value = "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP image under 2 MB.");
      return;
    }
    const body = new FormData();
    body.append("image", file);
    setBusy(true);
    try {
      const result = await fe1Request("/api/profile/avatar", { token, method: "PUT", body });
      if (!isRecord(result) || typeof result.avatarUrl !== "string") throw new Error("Invalid upload response");
      setNotice("Photo updated.");
      onSaved();
    } catch {
      setError("Could not save your photo. Please retry.");
    } finally { setBusy(false); }
  }
  return <div className={styles.editor}>
    <span className={styles.avatar} role="img" aria-label={name + "'s avatar"}
      style={avatarUrl ? { backgroundImage: "url(" + JSON.stringify(avatarUrl) + ")" } : undefined}>
      {avatarUrl ? null : name.trim().slice(0, 1).toUpperCase()}
    </span>
    <div className={styles.controls}>
      <label className={styles.upload} htmlFor="profile-avatar-file">{busy ? "Saving photo…" : "Change profile photo"}
        <input id="profile-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
          onChange={event => void onFile(event)} />
      </label>
      <small>JPG, PNG or WebP · max 2 MB</small>
      {notice && <span className={styles.notice} role="status">{notice}</span>}
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  </div>;
}
