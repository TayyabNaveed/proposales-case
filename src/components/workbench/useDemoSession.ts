"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "./api";
export function useDemoSession() {
  const [authenticated, setAuthenticated] = useState(false),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const expire = () => setAuthenticated(false);
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ authenticated: boolean }>("/api/session", undefined, () => {})
      .then((v) => {
        if (!cancelled) setAuthenticated(v.authenticated);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function login(code: string) {
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/api/session", { code }, expire);
      setAuthenticated(true);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { authenticated, checking, busy, message, expire, login };
}
export type DemoSession = ReturnType<typeof useDemoSession>;
