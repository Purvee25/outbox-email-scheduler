import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";

export default function DashboardPage() {
  // Dashboard reads ?slack= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
