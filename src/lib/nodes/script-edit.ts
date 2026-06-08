// Immutable, path-based edit helpers for a parsed script. Generic over plain
// nested objects/arrays so they stay pure and trivially testable. A path segment
// that is a number addresses an array index; a string addresses an object key.

type Path = (string | number)[];

function getAtPath(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key as never];
  }
  return cur;
}

// Returns a copy of `obj` with the value at `path` replaced. Does not mutate.
export function setScriptValue<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;

  if (typeof head === "number") {
    const arr = Array.isArray(obj) ? [...(obj as unknown[])] : [];
    arr[head] = rest.length === 0 ? value : setScriptValue(arr[head], rest, value);
    return arr as unknown as T;
  }

  const base =
    obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : {};
  return {
    ...base,
    [head]: rest.length === 0 ? value : setScriptValue(base[head], rest, value),
  } as T;
}

// Returns a copy of `obj` with `item` appended to the array at `path`.
export function addItem<T>(obj: T, path: Path, item: unknown): T {
  const current = getAtPath(obj, path);
  const arr = Array.isArray(current) ? current : [];
  return setScriptValue(obj, path, [...arr, item]);
}

// Returns a copy of `obj` with the element at `path`[index] removed.
export function removeItem<T>(obj: T, path: Path, index: number): T {
  const current = getAtPath(obj, path);
  const arr = Array.isArray(current) ? current : [];
  return setScriptValue(obj, path, arr.filter((_, i) => i !== index));
}
