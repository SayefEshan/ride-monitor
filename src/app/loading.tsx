/**
 * Fallback for navigations that cross the root segment (login → app,
 * onboarding). The route-group skeletons cover in-app tab changes.
 */
export default function RootLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-2 border-hairline border-t-brand" />
    </div>
  );
}
