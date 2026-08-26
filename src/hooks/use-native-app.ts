import { useSyncExternalStore } from "react";

import { isNativeApp } from "@/lib/native";

/** Whether the shell is the native one never changes for the life of the page. */
const subscribe = () => () => {};

/**
 * True when running inside the Capacitor shell. Server-renders as false and
 * settles on the real value at hydration — the native shell loads the same
 * deployed site a browser does, so the markup has to agree on the first pass.
 */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(subscribe, isNativeApp, () => false);
}
