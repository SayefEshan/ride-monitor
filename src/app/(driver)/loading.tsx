import { Card, Skeleton } from "@/components/ui";

/**
 * Same reason as the admin skeleton: pages render on the server per request,
 * and a driver on mobile data otherwise stares at a frozen tab for the whole
 * round trip.
 */
export default function DriverLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-6 w-36" />

      <Card className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-40" />
      </Card>

      {[0, 1, 2].map((i) => (
        <Card key={i} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      ))}
    </div>
  );
}
