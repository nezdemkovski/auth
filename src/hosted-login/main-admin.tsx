import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { AdminApp } from "./admin/AdminApp";
import { queryClient } from "./admin/routes/router";
import "./style.css";

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <QueryClientProvider client={queryClient}>
    <AdminApp />
  </QueryClientProvider>
);
