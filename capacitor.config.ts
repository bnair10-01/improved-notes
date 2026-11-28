import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.improvednotes",
  appName: "Improved Notes",
  webDir: "dist",
  backgroundColor: "#050505",
  ios: { contentInset: "never", backgroundColor: "#050505" },
  android: { backgroundColor: "#050505" },
};

export default config;
