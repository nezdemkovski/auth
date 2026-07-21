import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";

import "@nezdemkovski/auth-client-shared/style.css";
import { LoginConfigError, LoginConfigLoader } from "./config-loader";
import { parseOAuthSearch, stringifyOAuthSearch } from "./oauth-query";
import { LoginPage } from "./pages/LoginPage";
import { OAuthConsentPage } from "./pages/OAuthConsentPage";
import { PasswordResetPage } from "./pages/PasswordResetPage";

const root = createRoot(document.querySelector<HTMLDivElement>("#app")!);

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: LoginConfigError
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$project",
  component: LoginRoute
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$project/reset-password",
  component: ResetPasswordRoute
});

const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$project/oauth/consent",
  component: OAuthConsentRoute
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  resetPasswordRoute,
  oauthConsentRoute
]);

const loginRouter = createRouter({
  routeTree,
  basepath: "/login",
  parseSearch: parseOAuthSearch,
  stringifySearch: stringifyOAuthSearch
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof loginRouter;
  }
}

root.render(<RouterProvider router={loginRouter} />);

function LoginRoute() {
  const { project } = loginRoute.useParams();
  return (
    <LoginConfigLoader project={project} configPath="login">
      {(config) =>
        config.page === "oauth-consent" || config.page === "reset-password" ? (
          <LoginConfigError />
        ) : (
          <LoginPage config={config} />
        )
      }
    </LoginConfigLoader>
  );
}

function ResetPasswordRoute() {
  const { project } = resetPasswordRoute.useParams();
  return (
    <LoginConfigLoader project={project} configPath="reset-password">
      {(config) =>
        config.page === "reset-password" ? (
          <PasswordResetPage config={config} />
        ) : (
          <LoginConfigError />
        )
      }
    </LoginConfigLoader>
  );
}

function OAuthConsentRoute() {
  const { project } = oauthConsentRoute.useParams();
  return (
    <LoginConfigLoader project={project} configPath="oauth-consent">
      {(config) =>
        config.page === "oauth-consent" ? (
          <OAuthConsentPage config={config} />
        ) : (
          <LoginConfigError />
        )
      }
    </LoginConfigLoader>
  );
}
