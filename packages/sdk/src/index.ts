// Shared TypeScript clients for the Anchor programs.
// After `anchor build`, generate/copy program IDLs here and export typed clients,
// e.g.:
//   export { createLoyaltyClient } from "./loyalty";
//   export { createPaymentsClient } from "./payments";
//
// Consumed by both apps/mobile and services/api so on-chain logic isn't duplicated.

export * from "@cocktail/config";
export const SDK_VERSION = "0.1.0";
