# Solbuca — Core On-Chain Programs

Open-source Solana programs for a nightlife loyalty and USDC payments platform.
Security-first, built and tested incrementally. **Early development.**

> Solbuca connects venues, people, and the night: pay for your order in USDC and
> earn loyalty automatically, in a single atomic on-chain transaction. This
> repository contains the core on-chain programs — the proven foundation the
> wider product is built on.

---

## Status

**Early development — not production-ready.**

- The core "pay → earn" engine works and is covered by tests.
- The four core programs are **deployed and live on Solana devnet** (addresses below).
- Loyalty points are intentionally **not** a token (see Security & Design notes).
- The mobile app, social layer, competitions, and venue onboarding are **not built yet** —
  see Roadmap.

This is honest proof-of-work, not a finished product.

---

## On-chain deployment (devnet)

The four programs are live on Solana **devnet**. Verify any address in a Solana
explorer using `?cluster=devnet`.

| Program      | Program ID                                     |
|--------------|------------------------------------------------|
| `payments`   | `9XkouJjbZGywjF7b1k1bSTUdu4R2pNWDeL7ztXPQak5q` |
| `loyalty`    | `ECegX1btskZDKbtXprf9ZrqFwETpqQr62Zh1iTCZhd8Z` |
| `membership` | `9nDXZ8Stgpr9J8NsfwP8wLSnExG4iGTJuCCVXKhF5SbP` |
| `tournament` | `51XxAr16XmsU8foURdo664JDD1q67MsVTN3JjfWiP2Ja` |

_Devnet deployment for testing; not yet on mainnet._
## What works (proven by tests)

13 passing tests, including negative tests that prove each protection by attacking it:

- **Atomic pay-and-earn** — a guest pays USDC to a bar and loyalty points are credited
  in the same atomic transaction. No payment → no points (the transaction reverts).
- **Cross-program authorization** — only a bar's authority (verified against the
  `membership` program) can award or redeem loyalty points.
- **Bar-substitution protection** — points cannot be credited to one bar's loyalty
  account by signing as a different bar.
- **Double-spend protection** — each payment reference can settle only once.
- **CPI authenticity** — loyalty can only be credited via the `payments` program's
  PDA signature; a direct call cannot forge it.
- **Token-account & mint checks** — payment destination must belong to the bar, and
  payer/bar token mints must match.

Run them yourself (see Build & Test) and you should see **13 passing**.

---

## Architecture

Four Anchor (Rust) programs, linked by Cross-Program Invocation (CPI):

| Program      | Responsibility                                                        |
|--------------|----------------------------------------------------------------------|
| `membership` | Bar registry — the source of truth for "who is a registered bar".    |
| `loyalty`    | Loyalty points as non-transferable PDA balances (per user + bar).    |
| `payments`   | Atomic USDC payment + settlement record + CPI to credit loyalty.     |
| `tournament` | Competition logic — skeleton, planned for a later phase.             |

**Dependency direction:** `membership -> loyalty -> payments` (a tree, no cycles).
`loyalty` trusts the `payments` program by a hardcoded program ID, not a crate
dependency, so no circular dependency exists.

**The core flow (`payments::pay_and_record`):**
1. Transfer USDC from the guest's token account to the bar's token account (SPL Token CPI).
2. Write a `Settlement` record (PDA seeded by a unique reference — double-spend protection).
3. CPI into `loyalty::earn_via_payment`, signed by the `payments` program's `"authority"`
   PDA, to credit points (currently 1 point per 1 USDC).

If step 1 fails, the whole transaction reverts — points are never credited without payment.

---

## Security & design notes

- **Points are not a token.** Loyalty is stored as non-transferable PDA balances, not an
  SPL token. This is a deliberate choice to avoid securities exposure at this stage.
- **Authorization is verified, not assumed.** `loyalty` reads the `Bar` account from the
  `membership` program and checks the signer is its authority; `payments` proves payment
  before crediting points; loyalty credit via CPI requires the `payments` PDA signature.
- **Proven vs. coded.** Every protection above has a dedicated negative test. Where a
  check exists in code but is not yet covered by a test, it is noted as such in the code.
- **Known stubs / deferred:** the real USDC mint check is deferred to mainnet config
  (localnet uses a mock mint); the points rate (1:1) is a constant, intended to be
  configurable later.

Built by a smart-contract security researcher; correctness and honest impact framing are
first-class goals.

---

## Build & test

Requirements: a working Anchor / Solana toolchain.

- Anchor CLI `0.31.1`
- Solana CLI `3.x` (Agave)
- Rust (stable), Node.js `22.x`, a JS package manager (pnpm / yarn / npm)

```bash
# install JS deps (example with pnpm)
pnpm install

# build all programs
anchor build

# run the full test suite on a local validator
anchor test
```

Expected result: **13 passing**.

---

## Roadmap

- **Phase 0 — Core (done):** four programs, atomic pay -> earn, 13 tests, open source. Localnet.
- **Phase 1 — Network & basics:** devnet deploy; membership NFT; bar map; cocktail menu;
  basic mobile app (onboarding, pay, points).
- **Phase 2 — Social layer:** profiles, friends, competitions & rankings, proof-of-visit,
  recipes, content.
- **Phase 3 — Scale & monetization:** venue subscriptions / referral revenue-share,
  EU market expansion, multi-language support. Payments stay fee-free as a competitive edge.
- **Phase 4 — (long-term) token:** a utility token with proper legal review (EU MiCA /
  Ukraine), rewarding active participants and bars. Only after regulatory preparation.

---

## License

[MIT](./LICENSE)

---

*This README describes the current, honest state of the project. Claims here can be
verified against the code and the test suite.*
