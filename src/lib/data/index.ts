import { localDateOf, DEFAULT_TIMEZONE } from "../time";
import { createFirestoreFromEnv } from "./firestore";
import { GuardedDataAccess } from "./guarded";
import { createDemoStore } from "./seed";
import type { DataAccess } from "./types";

export * from "./types";

/** Demo mode (in-memory example data) unless a Firebase project is configured. Only a boolean is derived from the env. */
export const isDemoMode = (): boolean => !process.env.FIREBASE_PROJECT_ID?.trim();

interface Holder {
  store?: Promise<DataAccess>;
  firestore?: DataAccess;
  seededOn?: string;
}
const g = globalThis as typeof globalThis & { __ragnorDemo?: Holder };
const holderFor = (): Holder => (g.__ragnorDemo ??= {});

/** The data layer for this process: Firestore when FIREBASE_PROJECT_ID is set, otherwise the seeded in-memory demo store. */
export async function getDataAccess(): Promise<DataAccess> {
  if (!isDemoMode()) {
    // Firestore (server-only, Admin SDK) behind the same guard as the demo store. Not yet run against a real project.
    return (holderFor().firestore ??= new GuardedDataAccess(createFirestoreFromEnv()));
  }
  const holder = (g.__ragnorDemo ??= {});
  const today = localDateOf(new Date(), DEFAULT_TIMEZONE);
  // Demo data is dated relative to "today", so re-seed once a day (this discards demo entries).
  if (!holder.store || holder.seededOn !== today) {
    holder.seededOn = today;
    holder.store = createDemoStore();
  }
  return holder.store;
}
