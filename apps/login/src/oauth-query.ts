export const hasSignedOAuthQuery = (search: string) => {
  const params = new URLSearchParams(search);
  return params.has("sig") && params.has("ba_param");
};

export const parseOAuthSearch = (search: string) => {
  const parsed: Record<string, string | string[]> = {};
  const params = new URLSearchParams(search);

  for (const [key, value] of params) {
    const current = parsed[key];
    if (current === undefined) {
      parsed[key] = value;
    } else if (typeof current === "string") {
      parsed[key] = [current, value];
    } else {
      current.push(value);
    }
  }

  return parsed;
};

const appendSearchValue = (
  params: URLSearchParams,
  key: string,
  value: unknown
) => {
  if (value === undefined || value === null) {
    return;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    params.append(key, String(value));
    return;
  }
  throw new TypeError(`Search parameter ${key} must be a scalar or an array`);
};

export const stringifyOAuthSearch = (search: Record<string, unknown>) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        appendSearchValue(params, key, item);
      }
    } else {
      appendSearchValue(params, key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
};
