import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/lib/auth";
import { NAV, isActive } from "@/lib/nav";
import { NavIcon, navKind } from "./NavIcon";
import { studyOverviewQuery } from "@/lib/study";

/** The narrow icon rail on laptops and tablets: the mark, the sections, and who you are. */
export function Rail({ initials, avatarUrl }: { initials: string; avatarUrl: string | null }) {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: study } = useQuery({ ...studyOverviewQuery, enabled: !!user });
  const due = study?.dueTotal ?? 0;
  return (
    <nav aria-label="Sections" data-rail className="fixed inset-y-0 left-0 z-40 hidden w-[52px] flex-col items-center gap-1.5 border-r bg-background py-3 md:flex" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <Link to="/" aria-label="Improved Notes home" className="mb-3.5"><BrandMark className="h-7 w-7" /></Link>
      {user && NAV.map((n) => {
        const on = isActive(n, pathname);
        return (
          <Link key={n.to} to={n.to} aria-label={n.label} title={n.label} aria-current={on ? "page" : undefined}
            className={`relative grid h-[38px] w-[38px] place-items-center rounded-lg transition-colors ${on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}>
            <NavIcon kind={navKind(n.to)} className="h-[20px] w-[20px]" strokeWidth={on ? 2 : 1.6} />
            {n.to === "/study" && due > 0 && <span aria-label={`${due} cards due`} className="absolute right-[6px] top-[6px] h-1.5 w-1.5 rounded-full bg-foreground" />}
          </Link>
        );
      })}
      {user && (
        <Link to="/settings" aria-label="Settings" title="Settings" className="mt-auto">
          {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-[30px] w-[30px] rounded-full object-cover" />
            : <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-secondary text-[10.5px] font-medium">{initials}</span>}
        </Link>
      )}
    </nav>
  );
}
