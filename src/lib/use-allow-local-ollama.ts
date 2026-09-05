"use client";

import { useSyncExternalStore } from "react";
import { isBrowserLocalPixelCrewHost } from "./local-app-host";

/**
 * True when the browser is on localhost (PixelCrew + Ollama can share a machine).
 * Server snapshot is always false to avoid hydration mismatches.
 */
export function useAllowLocalOllama(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => isBrowserLocalPixelCrewHost(),
    () => false,
  );
}
