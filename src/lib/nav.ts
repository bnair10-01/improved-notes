import { BookOpenCheck, Home, Library, ScanLine } from "lucide-react";

/** Single source of truth for the main sections. New phases add an entry here (and to NEW_ACTIONS) so header, phone tab bar and home stay in sync. */
export const NAV = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/vault", label: "Notes", icon: Library, exact: false },
  { to: "/study", label: "Study", icon: BookOpenCheck, exact: false },
  { to: "/history", label: "Scans", icon: ScanLine, exact: false },
] as const;
