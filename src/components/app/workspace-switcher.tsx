"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceContext } from "@/lib/app/workspace-contexts";
import { cn } from "@/lib/utils";

type WorkspaceSwitcherProps = {
  contexts: WorkspaceContext[];
  active: WorkspaceContext | null;
};

/**
 * SAN-1575 — workspace choice is navigation only. The list contains just the
 * contexts the server resolved for this request; selecting one never grants a
 * role, cookie or database privilege.
 */
export function WorkspaceSwitcher({ contexts, active }: WorkspaceSwitcherProps) {
  if (contexts.length === 0) return null;

  if (contexts.length === 1) {
    return (
      <span
        data-testid="workspace-current"
        className="truncate rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground"
      >
        {contexts[0].label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="workspace-switcher"
        aria-label={`Switch workspace. Current: ${active?.label ?? "Personal"}`}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3",
          "text-sm font-medium text-foreground transition-colors hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <span className="max-w-[10rem] truncate">
          {active?.label ?? "Workspaces"}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {contexts.map((context) => (
            <DropdownMenuItem
              key={context.kind}
              render={
                <Link
                  href={context.href}
                  data-testid={`workspace-switcher-${context.kind}`}
                  aria-current={
                    context.kind === active?.kind ? "page" : undefined
                  }
                />
              }
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <span className="text-sm font-medium">{context.label}</span>
              <span className="text-xs text-muted-foreground">
                {context.description}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
