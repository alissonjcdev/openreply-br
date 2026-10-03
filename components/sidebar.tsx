"use client";

/**
 * Sidebar — macOS source list.
 *
 * Tinted line icons, neutral selection (no filled accent pill), material
 * background. Interface preferences live in Settings, not here.
 */

import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { zernioLink } from "@/lib/zernio-links";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Inbox,
  LayoutGrid,
  Megaphone,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

const navItems: { label: "Dashboard" | "Overview" | "Inbox" | "Campaigns" | "DM Logs" | "Settings" | "Diagnostics"; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Overview", href: "/overview", icon: BarChart3 },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "DM Logs", href: "/logs", icon: ScrollText },
];

const secondaryItems: typeof navItems = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Diagnostics", href: "/diagnostics", icon: Activity },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
}

export default function Sidebar({
  isOpen,
  onClose,
  workspaceName,
}: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();

  const renderItem = (item: (typeof navItems)[number]) => {
    const isActive =
      pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-md px-2.5 h-8 text-[14px] transition-colors ${
          isActive
            ? "bg-foreground/[0.08] text-foreground font-medium"
            : "text-foreground/85 hover:bg-foreground/[0.05]"
        }`}
      >
        <Icon
          aria-hidden
          strokeWidth={1.9}
          className={`size-[17px] shrink-0 ${isActive ? "text-accent" : "text-accent/90"}`}
        />
        <span className="truncate">{t(item.label)}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-overlay lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          material fixed top-0 left-0 z-50 h-dvh w-[248px] max-w-[85vw] shrink-0 border-r border-border flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          lg:h-full lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* The drawer is full height, so the wordmark would otherwise land
            under the status bar when installed to the home screen. */}
        <div
          className="px-5 pb-3"
          style={{ paddingTop: "calc(1.15rem + env(safe-area-inset-top))" }}
        >
          <Link
            href="/dashboard"
            onClick={onClose}
            className="text-[15px] font-semibold tracking-[-0.02em]"
          >
            OpenReply
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pt-1">
          <div className="space-y-px">{navItems.map(renderItem)}</div>
          <p className="px-2.5 pt-5 pb-1.5 text-[12px] font-semibold text-muted">
            {t("Workspace")}
          </p>
          <div className="space-y-px">{secondaryItems.map(renderItem)}</div>
        </nav>

        <div className="px-5 py-4 border-t border-border">
          <p className="truncate text-[13px] font-medium">{workspaceName}</p>
          <p className="caption mt-0.5">{t("Self-hosted")}</p>
          <a
            href={zernioLink({ placement: "sidebar" })}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="caption mt-2 inline-block hover:text-foreground"
          >
            {t("Supported by")} Zernio
          </a>
        </div>
      </aside>
    </>
  );
}
