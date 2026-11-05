"use client";

// Object URLs live only in memory. Nothing is sent to Supabase, Render or localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type AvatarPreviewContext = {
  avatarFor: (id: string) => string | null;
  preview: (id: string, image: File) => void;
};
const Context = createContext<AvatarPreviewContext | null>(null);

export function AvatarPreviewProvider({ children }: { children: ReactNode }) {
  const [urls, setUrls] = useState<Record<string,string>>({});
  const urlsRef = useRef<Record<string,string>>({});
  const preview = useCallback((id: string, image: File) => {
    const url = URL.createObjectURL(image);
    const old = urlsRef.current[id];
    urlsRef.current = { ...urlsRef.current, [id]: url };
    setUrls({ ...urlsRef.current });
    if (old) URL.revokeObjectURL(old);
  }, []);
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach(url => URL.revokeObjectURL(url));
  }, []);
  const avatarFor = useCallback((id: string) => urls[id] ?? null, [urls]);
  const value = useMemo(() => ({ avatarFor, preview }), [avatarFor, preview]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAvatarPreview() {
  const context = useContext(Context);
  if (!context) throw new Error("AvatarPreviewProvider is required");
  return context;
}
