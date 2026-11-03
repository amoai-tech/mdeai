import { HostEventProvider } from "@/components/host/host-event-provider";

/** SAN-1577 — the wizard keeps its deliberately separate hostEventAgent scope. */
export default function AppEventNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HostEventProvider>{children}</HostEventProvider>;
}
