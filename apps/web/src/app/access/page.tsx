import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessClient } from "@/app/access/access-client";
import { publicUser, SHEET_LISTS } from "@/lib/access-control";
import { userFromCookies } from "@/lib/auth";
import { hydrateStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const data = await hydrateStore();
  const user = await userFromCookies(data.accessUsers);
  if (!user) redirect("/login?next=/access");

  if (!user.permissions.canManageAccess) {
    return (
      <main className="access-page">
        <section className="card access-denied">
          <div className="card-head">
            <span className="card-title">Access denied</span>
            <span className="badge b-r">{user.role}</span>
          </div>
          <div className="card-body">
            <p>Your account can view assigned dashboard data only.</p>
            <Link className="btn" href="/">Return to dashboard</Link>
          </div>
        </section>
      </main>
    );
  }

  return <AccessClient currentUser={user} initialUsers={data.accessUsers.map(publicUser)} lists={[...SHEET_LISTS]} />;
}
