import { createRoot } from "react-dom/client";
import { AppRouter } from "./router.tsx";
import { AuthProvider } from "./lib/AuthContext.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { disableScreenSharingApis } from "./lib/mediaPolicy.ts";
import "./styles/index.css";

disableScreenSharingApis();

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  </AuthProvider>,
);
