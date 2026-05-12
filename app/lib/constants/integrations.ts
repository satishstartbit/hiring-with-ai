export const INTEGRATION_PROVIDERS = [
  "linkedin",
  "indeed",
  "naukri",
  "monster",
  "glassdoor",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
