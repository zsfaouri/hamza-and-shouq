"use client";

import { useState } from "react";

export default function LoginForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      window.location.href = "/";
      return;
    }
    const data = await response.json().catch(() => ({}));
    setError(data.error || "Login failed.");
    setBusy(false);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Hamza and Shouq</h1>
        <p className="muted">Invitation control room</p>
        <div className="field">
          <label>Username</label>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {error ? <p className="notice error">{error}</p> : null}
        <button className="btn primary" disabled={busy} type="submit">{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}
