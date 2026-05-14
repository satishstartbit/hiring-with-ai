// Only LinkedIn is supported today. Other job boards (Indeed, Naukri, Monster,
// Glassdoor) were removed until their partner APIs are actually wired up.
export const INTEGRATION_PROVIDERS = ["linkedin"] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
