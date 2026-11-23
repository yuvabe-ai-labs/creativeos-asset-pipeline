import type { DraftPair } from "./price-draft";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OTHER = "__other__";

/** A pair's name picked from known names, or typed by hand after choosing "Other name". */
export function PairKeySelect({
  pair,
  options,
  placeholder,
  onChange,
}: {
  pair: DraftPair;
  options: readonly string[];
  placeholder: string;
  onChange: (patch: Partial<DraftPair>) => void;
}) {
  const typed = pair.custom === true || (pair.key !== "" && !options.includes(pair.key));
  const shown = typed ? "Other name" : pair.key;
  return (
    <>
      <Select
        value={typed ? OTHER : pair.key === "" ? null : pair.key}
        onValueChange={(v) => {
          if (!v) return;
          onChange(v === OTHER ? { key: typed ? pair.key : "", custom: true } : { key: v, custom: false });
        }}
      >
        <SelectTrigger className="w-full min-w-0" aria-label={placeholder}>
          {shown ? <SelectValue>{shown}</SelectValue> : <SelectValue placeholder={placeholder} />}
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Other name</SelectItem>
        </SelectContent>
      </Select>
      {typed && (
        <Input
          aria-label={placeholder}
          placeholder={placeholder}
          value={pair.key}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      )}
    </>
  );
}
