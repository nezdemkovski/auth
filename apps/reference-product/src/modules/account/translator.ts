import type { ProductAccount } from "./core";

export type ProductAccountResponse = {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  identity: {
    issuer: string;
    subject: string;
  };
};

export const productAccountResponse = (
  account: ProductAccount
): ProductAccountResponse => {
  return {
    user: {
      id: account.user.id,
      name: account.user.name ?? null,
      email: account.user.email ?? null,
      image: account.user.image ?? null
    },
    identity: {
      issuer: account.identity.issuer,
      subject: account.identity.subject
    }
  };
};
