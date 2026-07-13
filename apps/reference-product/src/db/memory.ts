import type { MemoryDB } from "@better-auth/memory-adapter";

export const createReferenceProductDatabase = (): MemoryDB => {
  return {
    user: [],
    session: [],
    account: [],
    verification: []
  };
};
