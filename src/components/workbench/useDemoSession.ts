"use client";
import { useState } from "react";
import { apiRequest } from "./api";
// Starts from the session the server read for this page.
export function useDemoSession(initialAuthenticated: boolean) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const expire = () => setAuthenticated(false);
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
  return { authenticated, busy, message, expire, login };
}
export type DemoSession = ReturnType<typeof useDemoSession>;
