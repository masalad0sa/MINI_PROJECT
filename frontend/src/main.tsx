import { createRoot } from "react-dom/client";
import { AppRouter } from "./router.tsx";
import { AuthProvider } from "./lib/AuthContext.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <AppRouter />
  </AuthProvider>,
);

