export const hasSignedOAuthQuery = (search: string) => {
  const params = new URLSearchParams(search);
  return params.has("sig") && params.has("ba_param");
};
