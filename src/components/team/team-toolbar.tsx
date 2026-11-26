"use client";

import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientMark } from "@/components/shared/client-mark";
import type { ClientBrief } from "@/lib/db/types";
import { TEAM_TABS, type TeamCounts, type TeamFilter, type TeamTab } from "@/lib/people/team-list";

const ALL_CLIENTS = "all";

const TAB_LABEL = (tab: TeamTab, counts: TeamCounts) =>
  ({ all: "All", waiting: `Waiting (${counts.waiting})`, invited: `Invited (${counts.invited})`, members: "Members" })[tab];

// The Team page's search, client filter and All / Waiting / Invited / Members.
export function TeamToolbar({
  filter,
  onChange,
  clients,
  counts,
}: {
  filter: TeamFilter;
  onChange: (next: TeamFilter) => void;
  clients: readonly ClientBrief[];
  counts: TeamCounts;
}) {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const items = [{ value: ALL_CLIENTS, label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-0 flex-1 basis-56 bg-card">
          <InputGroupAddon><Search strokeWidth={1.5} /></InputGroupAddon>
          <InputGroupInput
            placeholder="Search people"
            aria-label="Search people"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
          />
        </InputGroup>
        {clients.length > 0 && (
          <Select
            items={items}
            value={filter.clientId ?? ALL_CLIENTS}
            onValueChange={(v) => onChange({ ...filter, clientId: !v || v === ALL_CLIENTS ? null : String(v) })}
          >
            <SelectTrigger className="w-52 bg-card" aria-label="Filter by client">
              <SelectValue>
                {(value: string) => {
                  const c = byId.get(value);
                  return c ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <ClientMark name={c.name} logoUrl={c.logo_url} />
                      <span className="truncate">{c.name}</span>
                    </span>
                  ) : (
                    "All clients"
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <ClientMark name={c.name} logoUrl={c.logo_url} />
                  <span className="truncate">{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <Tabs value={filter.tab} onValueChange={(v) => onChange({ ...filter, tab: v as TeamTab })}>
        <TabsList aria-label="Show">
          {TEAM_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="px-3">
              {TAB_LABEL(tab, counts)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
