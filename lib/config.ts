// Which integrations are live. Everything has a demo-mode fallback so the app always runs.
export const config = {
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  elevenKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenAgentId: process.env.ELEVENLABS_AGENT_ID ?? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "",
  elevenPhoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID ?? "",
  demoCallToNumber: process.env.DEMO_CALL_TO_NUMBER ?? "",
  toolSecret: process.env.RAGNOR_TOOL_SECRET ?? "",
  googleClientId: process.env.GOOGLE_HEALTH_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_HEALTH_CLIENT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
};

export const live = {
  gemini: () => Boolean(config.geminiKey),
  elevenPhone: () => Boolean(config.elevenKey && config.elevenAgentId && config.elevenPhoneNumberId),
  elevenWeb: () => Boolean(config.elevenAgentId),
  googleHealth: () => Boolean(config.googleClientId && config.googleClientSecret),
  firestore: () => Boolean(config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey),
};

export function integrationStatus() {
  return {
    gemini: live.gemini(),
    elevenlabs_phone: live.elevenPhone(),
    elevenlabs_web: live.elevenWeb(),
    google_health: live.googleHealth(),
    firestore: live.firestore(),
    model: config.geminiModel,
  };
}
