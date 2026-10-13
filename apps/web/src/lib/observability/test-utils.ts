import type { LogLine } from "@loyalty/shared/logger";
import { setLogSink } from "./logger";

/** Cattura le righe di log scritte durante un test. */
export function captureLogs(): LogLine[] {
  const lines: LogLine[] = [];
  setLogSink((_text, line) => lines.push(line));
  return lines;
}
