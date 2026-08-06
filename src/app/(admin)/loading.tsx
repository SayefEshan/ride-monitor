import { Card, Skeleton } from "@/components/ui";

/**
 * Every admin page is rendered on the server per request (session cookie +
 * Supabase queries), so a tab change waits a full round trip. This shows
 * inside the persistent shell immediately instead of a frozen old page.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </Card>
        ))}
      </div>

      <Card className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 w-full" />
      </Card>

      <Card className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}
