// Optional Firestore mirror. When Firebase credentials are set, every write in the store is
// mirrored to Firestore (alerts, check-ins, landing screens, signups, audit log).
// Without credentials this is a no-op and the in-memory store is the source of truth.
import { config, live } from "./config.ts";

type Db = import("firebase-admin/firestore").Firestore;
let dbPromise: Promise<Db | null> | null = null;

async function getDb(): Promise<Db | null> {
  if (!live.firestore()) return null;
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const { initializeApp, getApps, cert } = await import("firebase-admin/app");
        const { getFirestore } = await import("firebase-admin/firestore");
        const app =
          getApps()[0] ??
          initializeApp({
            credential: cert({
              projectId: config.firebaseProjectId,
              clientEmail: config.firebaseClientEmail,
              privateKey: config.firebasePrivateKey,
            }),
          });
        return getFirestore(app);
      } catch (e) {
        console.error("[firestore] init failed, staying in memory mode", e);
        return null;
      }
    })();
  }
  return dbPromise;
}

/** Fire-and-forget write. Never throws into the request path. */
export function mirror(collection: string, id: string, data: object): void {
  void getDb().then(async (db) => {
    if (!db) return;
    try {
      await db.collection(collection).doc(id).set(JSON.parse(JSON.stringify(data)), { merge: true });
    } catch (e) {
      console.error(`[firestore] write ${collection}/${id} failed`, e);
    }
  });
}
