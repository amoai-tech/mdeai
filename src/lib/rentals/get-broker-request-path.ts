import { headers } from "next/headers";
import { BROKER_HOME_PATH } from "@/lib/rentals/broker-route-gate";

/** Current rentals path + query for login `next` (set by middleware `x-pathname`). */
// skipcq: JS-0067
export async function getBrokerRequestPathname(
  basePath: string = BROKER_HOME_PATH,
): Promise<string> {
  const pathWithQuery = (await headers()).get("x-pathname");
  if (
    pathWithQuery === basePath ||
    pathWithQuery?.startsWith(`${basePath}/`) ||
    pathWithQuery?.startsWith(`${basePath}?`)
  ) {
    return pathWithQuery;
  }
  return basePath;
}
