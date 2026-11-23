"use client";

import { useState } from "react";

/** State that starts from a value the server sent and can be edited locally, and that takes the
 *  server's value again whenever the server's value itself changes (`version` is what identifies
 *  it). For a form whose data can also be changed from somewhere else on the page: the other
 *  change shows up without remounting the form, so nothing else the person typed is lost.
 *  Adjusts during render, which is React's pattern for state that follows a prop. */
export function useServerState<T>(server: T, version: string) {
  const [value, setValue] = useState(server);
  const [seen, setSeen] = useState(version);
  if (seen !== version) {
    setSeen(version);
    setValue(server);
  }
  return [value, setValue] as const;
}
