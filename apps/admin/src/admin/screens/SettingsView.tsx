import { DeliverySection } from "./settings/DeliverySection";
import { ObservabilitySection } from "./settings/ObservabilitySection";
import { ProfileSection } from "./settings/ProfileSection";
import { SecuritySection } from "./settings/SecuritySection";
import type { MeResponse } from "../types";

export function SettingsView({ me }: { me: MeResponse }) {
  return (
    <div className="space-y-12">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">Admin</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[56px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Settings<em>.</em>
        </h1>
        <p className="mt-3 max-w-[36rem] text-[14.5px] leading-[1.55] text-muted">
          Manage your admin account.
        </p>
      </div>

      <ProfileSection me={me} />
      <SecuritySection />
      <DeliverySection />
      <ObservabilitySection />
    </div>
  );
}
