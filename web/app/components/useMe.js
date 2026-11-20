"use client";
import { useEffect, useState } from "react";

export function useMe() {
  const [me, setMe] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null))
      .then((m) => { setMe(m); setLoaded(true); });
  }, []);
  return { me, loaded, setMe };
}
