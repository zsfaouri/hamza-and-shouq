"use client";

import Link from "next/link";
import { useState } from "react";
import type { AccessRole, SessionUser } from "@/lib/access-control";

type EditableUser = Omit<SessionUser, "permissions">;

const roleLabels: Record<AccessRole, string> = {
  admin: "Admin",
  "zein-admin": "Zein Admin",
  hamza: "Hamza read-only",
  shouq: "Shouq only",
};

export function AccessClient({ currentUser, initialUsers, lists }: {
  currentUser: SessionUser;
  initialUsers: SessionUser[];
  lists: string[];
}) {
  const toEditable = (user: SessionUser): EditableUser => ({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    allowedTabs: user.allowedTabs,
    active: user.active,
  });
  const [users, setUsers] = useState<EditableUser[]>(initialUsers.map(toEditable));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function updateUser(id: string, patch: Partial<EditableUser>) {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...patch } : user));
  }

  async function save() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/access/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Access update failed");
      setUsers((body.users as SessionUser[]).map(toEditable));
      setNotice("Access rules saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-top">
        <div>
          <h1>Access Management</h1>
          <p>Signed in as {currentUser.name}. API permissions are enforced server-side.</p>
        </div>
        <div className="btn-row">
          <Link className="btn" href="/">Dashboard</Link>
          <button className="btn" onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}>
            Logout
          </button>
        </div>
      </section>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="notice err">{error}</div> : null}

      <section className="card">
        <div className="card-head">
          <span className="card-title">Users and roles</span>
          <button className="btn btn-p" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save access"}</button>
        </div>
        <div className="access-users">
          {users.map((user) => (
            <article className="access-user-row" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span>@{user.username}</span>
              </div>

              <select
                className="select"
                value={user.role}
                disabled={user.id === currentUser.id}
                onChange={(event) => updateUser(user.id, { role: event.target.value as AccessRole })}
              >
                {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>

              <label className="access-active">
                <input
                  type="checkbox"
                  checked={user.active}
                  disabled={user.id === currentUser.id}
                  onChange={(event) => updateUser(user.id, { active: event.target.checked })}
                />
                Active
              </label>

              <div className="access-list-checks">
                {lists.map((list) => (
                  <label key={list}>
                    <input
                      type="checkbox"
                      checked={user.allowedTabs.includes(list)}
                      disabled={user.role === "admin" || user.role === "hamza" || user.role === "shouq"}
                      onChange={(event) => {
                        const allowedTabs = event.target.checked
                          ? [...user.allowedTabs, list]
                          : user.allowedTabs.filter((tab) => tab !== list);
                        updateUser(user.id, { allowedTabs });
                      }}
                    />
                    {list}
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="card-title">Permission rules</span></div>
        <div className="access-matrix-wrap">
          <table className="tbl access-matrix">
            <thead>
              <tr><th>Role</th><th>Lists</th><th>Read</th><th>Import</th><th>Prepare</th><th>Send</th><th>Access</th></tr>
            </thead>
            <tbody>
              <tr><td>Admin</td><td>All</td><td>All</td><td>All</td><td>All</td><td>All</td><td>Manage</td></tr>
              <tr><td>Zein Admin</td><td>Assigned only</td><td>Assigned</td><td>Assigned</td><td>Assigned</td><td>Assigned</td><td>None</td></tr>
              <tr><td>Hamza</td><td>All</td><td>All</td><td>None</td><td>None</td><td>None</td><td>None</td></tr>
              <tr><td>Shouq</td><td>Shouq only</td><td>Shouq</td><td>None</td><td>None</td><td>None</td><td>None</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
