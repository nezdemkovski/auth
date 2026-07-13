import type { ProductAccount } from "./core";

export type ProductAccountResponse = {
  user: {
    id: string;
    name: string;
    email: string;
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
      name: account.user.name,
      email: account.user.email,
      image: account.user.image ?? null
    },
    identity: {
      issuer: account.identity.issuer,
      subject: account.identity.subject
    }
  };
};
