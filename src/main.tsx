import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./styles.css";
import { getRouter } from "./router";
import { startUploadQueue } from "./lib/upload-queue";
import { uploadPending } from "./lib/notes";
import { Capacitor } from "@capacitor/core";
import { LaunchSplash, holdForSplash } from "./components/LaunchSplash";

// Inside the phone apps the page is the app, so it never zooms: no pinch or double-tap zoom to get stuck in.
// (The website keeps normal zoom. Phones still have their own system Zoom for anyone who needs it.)
if (Capacitor.isNativePlatform()) {
  document.documentElement.setAttribute("data-native", "");
  document.querySelector('meta[name="viewport"]')?.setAttribute("content", "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
}

holdForSplash();
const router = getRouter();
startUploadQueue(uploadPending);

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <LaunchSplash />
  </StrictMode>,
);

if (import.meta.env.VITE_NATIVE_SELFTEST) void import("./lib/selftest").then((m) => m.runSelfTest());
