import { ContestDirectory } from "@/components/restaurants/contest-directory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Restaurant contests · mdeai",
  description: "Discover Medellín restaurant contests and vote for the restaurants you love.",
};

/**
 * SAN-1524 · the route stays thin. The directory itself lives in one component so the page file
 * keeps only route configuration and metadata (Next validates page exports strictly).
 *
 * No `loading.tsx` at this segment on purpose: it would also wrap `/contests/[id]` and turn an
 * unknown contest's `notFound()` into a 200 soft 404, because the shell streams before the check.
 */
export default async function ContestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const params = await searchParams;
  return <ContestDirectory status={params.status} />;
}
