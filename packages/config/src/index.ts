export type Cluster = "devnet" | "mainnet-beta" | "localnet";

export const CLUSTER: Cluster =
  (process.env.SOLANA_CLUSTER as Cluster) ?? "devnet";

// Placeholders — replaced after `anchor keys sync` / deploy.
export const PROGRAM_IDS = {
  loyalty: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  membership: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  payments: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  tournament: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
} as const;

export const USDC_MINT = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // devnet USDC-Dev
} as const;
