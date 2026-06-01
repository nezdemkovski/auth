import { SettingsView } from "../screens/SettingsView";
import { rootRoute } from "./router";

export function SettingsRoute() {
  const { me } = rootRoute.useRouteContext();
  return <SettingsView me={me} />;
}
