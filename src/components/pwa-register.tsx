"use client";

import { useEffect } from "react";

/** Registers the service worker so the driver can install the app. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing costs the install prompt and nothing else, so
      // there is no user-facing error worth raising here.
    });
  }, []);

  return null;
}
