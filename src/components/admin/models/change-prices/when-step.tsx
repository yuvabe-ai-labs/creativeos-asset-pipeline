"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, Clock } from "lucide-react";
import { whenInstant, whenProblem, type When } from "@/lib/admin/change-prices-when";
import { formatIstDate, formatIstWhen, formatUtcBeside, istDate, istTime, parseIstTime, relativeIstDay, todayIst } from "@/lib/admin/ist";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChoiceCards } from "./choice-cards";

// The calendar works in the browser's local dates; an IST date ("YYYY-MM-DD") is held at local noon so
// no time zone can move it to another day.
const toLocal = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const fromLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "When do the new prices start?": Now, or an IST date and time with UTC under it, and the scheduled change's start as a shortcut. */
export function WhenStep({
  when,
  now,
  scheduled,
  shortcut,
  onChange,
}: {
  when: When;
  now: Date;
  /** Starts of changes already scheduled, marked on the calendar. */
  scheduled: Date[];
  /** The scheduled change's start, offered as one click. */
  shortcut: Date | null;
  onChange: (when: Partial<When>) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = todayIst(now);
  const at = whenInstant(when, now);
  const problem = whenProblem(when, now);
  const time = parseIstTime(when.time);
  const marks = scheduled.map((d) => toLocal(istDate(d)));
  const onShortcut = shortcut && istDate(shortcut) === when.date && istTime(shortcut) === time;

  return (
    <div className="flex flex-col gap-3">
      <ChoiceCards
        label="When the new prices start"
        value={when.mode}
        onChange={(mode) => onChange({ mode })}
        choices={[
          { value: "now", title: "Now", detail: "New runs use the new prices straight away. Runs already going keep the price they started with." },
          { value: "date", title: "On a date", detail: "Today's prices stay until then. Use this when the vendor announces a change ahead." },
        ]}
      />
      {when.mode === "date" && (
        <>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="when-date" className="text-xs font-normal text-muted-foreground">Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger render={<Button id="when-date" variant="outline" className="w-[190px] justify-start font-normal" />}>
                  <CalendarDays aria-hidden strokeWidth={1.5} />
                  <span className="flex-1 text-left">{formatIstDate(toLocalIst(when.date))}</span>
                  <ChevronDown aria-hidden strokeWidth={1.5} className="text-muted-foreground" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2" aria-label="Pick a start date">
                  <Calendar
                    mode="single"
                    weekStartsOn={1}
                    selected={toLocal(when.date)}
                    defaultMonth={toLocal(when.date >= today ? when.date : today)}
                    disabled={{ before: toLocal(today) }}
                    modifiers={{ scheduled: marks }}
                    modifiersClassNames={{ scheduled: "after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary" }}
                    onSelect={(d) => {
                      if (d) onChange({ date: fromLocal(d) });
                      setCalendarOpen(false);
                    }}
                    autoFocus
                  />
                  {marks.length > 0 && (
                    <p className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                      <span aria-hidden className="size-1 rounded-full bg-primary" />A change is already scheduled
                    </p>
                  )}
                  <p className="px-2 pb-1 text-xs text-muted-foreground">Arrow keys move, Enter picks, Esc closes.</p>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="when-time" className="text-xs font-normal text-muted-foreground">Time in India (IST)</Label>
              <InputGroup className="w-[150px]">
                <InputGroupAddon aria-hidden><Clock strokeWidth={1.5} /></InputGroupAddon>
                <InputGroupInput
                  id="when-time"
                  value={when.time}
                  autoComplete="off"
                  aria-invalid={time === null || undefined}
                  aria-describedby="when-hint"
                  onChange={(e) => onChange({ time: e.target.value })}
                  onBlur={() => time && time !== when.time && onChange({ time })}
                />
                <InputGroupAddon align="inline-end" aria-hidden className="text-xs text-muted-foreground">IST</InputGroupAddon>
              </InputGroup>
            </div>
            <p id="when-hint" aria-live="polite" className="pt-6 text-[0.8125rem] md:max-w-[260px]">
              {problem || !at ? (
                <span className="text-destructive-text">{problem}</span>
              ) : (
                <>
                  Starts <span className="font-semibold">{formatIstDate(at)} at {time} IST</span>, {relativeIstDay(at, now)}
                  <span className="block text-xs text-muted-foreground">Same moment in UTC: {formatUtcBeside(at)}</span>
                </>
              )}
            </p>
          </div>
          {shortcut && (
            <div>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={onShortcut || undefined}
                className={cn("rounded-full", onShortcut && "border-primary bg-primary/5 text-primary")}
                onClick={() => onChange({ date: istDate(shortcut), time: istTime(shortcut) })}
              >
                The scheduled change&apos;s start: {formatIstWhen(shortcut)}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Noon IST on that date, for formatting only. */
function toLocalIst(iso: string): Date {
  return new Date(`${iso}T06:30:00Z`);
}
