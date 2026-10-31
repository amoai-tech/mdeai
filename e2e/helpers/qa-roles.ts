import { QA_HOST_EMAIL, QA_SUPER_ADMIN_EMAIL } from "./auth";

/** Role selection is explicit test intent, not guessed from a URL or page. */
export type QaRole = "anonymous" | "super-admin" | "event-host" | "renter" | "broker";

export function resolveQaRoleEmail(
  role: QaRole,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (role === "anonymous") return null;
  if (role === "super-admin") return QA_SUPER_ADMIN_EMAIL;
  if (role === "event-host") return QA_HOST_EMAIL;

  const key = role === "renter" ? "MDE_QA_RENTER_EMAIL" : "MDE_QA_BROKER_EMAIL";
  const email = env[key]?.trim().toLowerCase();
  if (!email) {
    throw new Error(`QA ${role} needs an existing dedicated account in ${key}; no Super Admin fallback`);
  }
  if (!/^qa-[a-z0-9._+-]+@mdeai\.co$/.test(email) || email === QA_HOST_EMAIL.toLowerCase()) {
    throw new Error(`QA ${role} requires a dedicated qa-*@mdeai.co account, not a customer or shared host`);
  }
  return email;
}
