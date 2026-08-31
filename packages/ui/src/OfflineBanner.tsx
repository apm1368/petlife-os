"use client";

import { useEffect, useState } from "react";

export interface OfflineBannerProps {
  message: string;
}

export function OfflineBanner({ message }: OfflineBannerProps) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div role="status" className="w-full bg-state-attention px-4 py-2 text-center text-status text-text-inverse">
      {message}
    </div>
  );
}