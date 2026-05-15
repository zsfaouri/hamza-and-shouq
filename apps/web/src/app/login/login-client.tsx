"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type FormEvent } from "react";

const demoUsers = [
  ["admin", "admin123", "Admin"],
  ["zein", "zein123", "Zein Admin"],
  ["hamza", "hamza123", "Hamza read-only"],
  ["shouq", "shouq123", "Shouq only"],
];

export function LoginClient({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Login failed");
      window.location.href = nextPath.startsWith("/") ? nextPath : "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/logo.png" alt="" />
          <div>
            <h1>Hamza &amp; Shouq</h1>
            <p>Access controlled campaign system</p>
          </div>
        </div>

        <label className="field">
          <span className="lbl">User</span>
          <select className="select" value={username} onChange={(event) => {
            const next = demoUsers.find(([id]) => id === event.target.value);
            setUsername(event.target.value);
            setPassword(next?.[1] ?? "");
          }}>
            {demoUsers.map(([id, , label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>

        <label className="field">
          <span className="lbl">Password</span>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>

        {error ? <div className="notice err">{error}</div> : null}

        <button className="btn btn-p btn-w" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <div className="login-users">
          {demoUsers.map(([id, pass, label]) => (
            <button
              key={id}
              type="button"
              className="filter-chip"
              onClick={() => {
                setUsername(id);
                setPassword(pass);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </form>
    </main>
  );
}
