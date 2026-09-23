"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ENGINES } from "@/lib/ugc/constants";
import { UgcBench } from "./ugc-bench";

// One board per engine, each with its own state. `keepMounted` matters: a Seedance board can
// have clips generating for a minute or more, and switching tabs must not throw that away.
export function UgcTabs() {
  return (
    <Tabs defaultValue="seedance">
      <TabsList>
        {ENGINES.map((e) => (
          <TabsTrigger key={e.id} value={e.id}>
            {e.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {ENGINES.map((e) => (
        <TabsContent key={e.id} value={e.id} keepMounted>
          <UgcBench engine={e.id} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
