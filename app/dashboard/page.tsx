import { redirect } from "next/navigation";

// The standalone dashboard landing page was removed. /dashboard now sends HR
// users straight to Jobs — login, middleware, and the root page all still
// point at /dashboard, so this redirect keeps every entry path working.
export default function DashboardIndexPage() {
  redirect("/dashboard/jobs");
}
