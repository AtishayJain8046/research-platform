"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useApi(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const router = useRouter();
  useEffect(() => {
    if (!url) return;
    fetch(url).then(async (r) => {
      if (r.status === 401) return router.push("/login");
      const j = await r.json();
      r.ok ? setData(j) : setError(j.error);
    });
  }, [url]);
  return { data, error };
}
