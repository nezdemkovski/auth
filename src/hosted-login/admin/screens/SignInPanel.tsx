import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { signInAdmin } from "../api";
import { FormField, PrimaryButton } from "../components/primitives";
import { notifyError } from "../toast";

export function SignInPanel({ error }: { error?: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: signInAdmin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    },
    onError: (caught) => {
      notifyError(
        "Could not sign in",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });

  useEffect(() => {
    if (error) notifyError(error);
  }, [error]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    mutation.mutate({ email, password });
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow">Admin</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink">
        Sign <em>in.</em>
      </h1>
      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        Access the admin control plane.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <FormField
          id="admin-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
        />
        <FormField
          id="admin-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <PrimaryButton type="submit" loading={mutation.isPending}>
          {mutation.isPending ? "Signing in…" : "Sign in ↗"}
        </PrimaryButton>
      </form>
    </div>
  );
}
