import { BookOpenCheck, Folders, Home, Library, Network } from "lucide-react";

/** Single source of truth for the main sections: the laptop rail, the phone tab bar and the top bar all read this. */
export const NAV = [
  { to: "/", label: "Home", short: "Ho", icon: Home, exact: true },
  { to: "/vault", label: "Notes", short: "No", icon: Library, exact: false },
  { to: "/topics", label: "Topics", short: "To", icon: Folders, exact: false },
  { to: "/study", label: "Study", short: "St", icon: BookOpenCheck, exact: false },
  { to: "/vault/graph", label: "Graph", short: "Gr", icon: Network, exact: false },
] as const;

export type NavItem = (typeof NAV)[number];

/** Is this section the one the person is in? Notes stays off while the graph (also under /vault) is open. */
export function isActive(item: Pick<NavItem, "to" | "exact">, pathname: string): boolean {
  if (item.exact) return pathname === item.to;
  if (item.to === "/vault") return pathname.startsWith("/vault") && !pathname.startsWith("/vault/graph");
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** A readable name for where the person is, for the top bar. */
export function sectionName(pathname: string): string {
  const hit = NAV.find((n) => isActive(n, pathname));
  if (hit) return hit.label;
  if (pathname.startsWith("/scan")) return "Scan";
  if (pathname.startsWith("/history")) return "Scans";
  if (pathname.startsWith("/review")) return "Review";
  if (pathname.startsWith("/settings")) return "Settings";
  return "";
}
