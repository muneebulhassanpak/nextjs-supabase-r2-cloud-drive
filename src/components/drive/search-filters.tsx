"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MODIFIED_FILTERS,
  OWNER_FILTERS,
  searchHref,
  TYPE_FILTERS,
  type SearchParams,
} from "@/lib/drive/search";

import { FilterMenu } from "./filter-menu";

/** The filters above search results. Each change is a new URL, so Back undoes it. */
export function SearchFilters({ params }: { params: SearchParams }) {
  const router = useRouter();
  const [from, setFrom] = useState(params.from ?? "");
  const [to, setTo] = useState(params.to ?? "");
  const apply = (changes: Partial<SearchParams>) => {
    router.push(searchHref({ ...params, ...changes }));
  };
  const filtered = params.type !== null || params.owner !== "any" || params.modified !== "any";

  function applyRange(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({
      modified: "custom",
      from: from || null,
      to: to || null,
      // The dates are days on this person's calendar.
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <FilterMenu
          label="Type"
          value={params.type ?? "any"}
          options={[{ value: "any", label: "Any type" }, ...TYPE_FILTERS]}
          active={params.type !== null}
          onChange={(value) => {
            apply({ type: value === "any" ? null : (value as SearchParams["type"]) });
          }}
        />
        <FilterMenu
          label="Owner"
          value={params.owner}
          options={OWNER_FILTERS}
          active={params.owner !== "any"}
          onChange={(value) => {
            apply({ owner: value as SearchParams["owner"] });
          }}
        />
        <FilterMenu
          label="Modified"
          value={params.modified}
          options={MODIFIED_FILTERS}
          active={params.modified !== "any"}
          onChange={(value) => {
            apply({ modified: value as SearchParams["modified"] });
          }}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              router.push(searchHref({ q: params.q }));
            }}
          >
            <X />
            Clear filters
          </Button>
        )}
      </div>
      {params.modified === "custom" && (
        <form
          onSubmit={applyRange}
          className="flex flex-wrap items-end gap-2"
          aria-label="Date range"
        >
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
              className="w-40"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
              }}
              className="w-40"
            />
          </label>
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
