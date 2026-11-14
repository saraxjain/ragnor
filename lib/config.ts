// Which integrations are live. Everything has a demo-mode fallback so the app always runs.
export const config = {
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  googleClientId: process.env.GOOGLE_HEALTH_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_HEALTH_CLIENT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
};

export const live = {
  gemini: () => Boolean(config.geminiKey),
  googleHealth: () => Boolean(config.googleClientId && config.googleClientSecret),
  firestore: () => Boolean(config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey),
};

export function integrationStatus() {
  return {
    gemini: live.gemini(),
    google_health: live.googleHealth(),
    firestore: live.firestore(),
    model: config.geminiModel,
  };
}
