import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.improvednotes",
  appName: "Improved Notes",
  webDir: "dist",
  backgroundColor: "#050505",
  // never: the web page handles the notch and home bar itself (env(safe-area-inset-*)), so the webview must not add its own.
  ios: { contentInset: "never", backgroundColor: "#050505" },
  android: { backgroundColor: "#050505" },
  plugins: {
    // Native Google sign-in. The Firebase JS SDK stays in charge of the session (skipNativeAuth), so everything else works as on the web.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ["google.com"] },
  },
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: "6.1",
        packageOptions: { "@capacitor-firebase/authentication": { symlink: true } },
        // Google Sign-In only; leave the Facebook SDK out.
        packageTraits: { "@capacitor-firebase/authentication": ["Google"] },
      },
    },
  },
};

export default config;
