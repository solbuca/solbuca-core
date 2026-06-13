# Cocktail Platform — скелет монорепо

Скелет проекта: Solana-платформа лояльности/платежей для баров с мобильным приложением (iOS + Android).
Это СТАРТОВЫЙ каркас для доработки, не финальный код. On-chain программы — осмысленные заготовки,
мобайл скаффолдится из Solana App Kit.

## Структура

```
apps/
  mobile/        React Native (Solana App Kit) — iOS + Android   [скаффолдить, см. README внутри]
programs/        Anchor workspace (Rust)
  loyalty/       баллы как PDA (НЕ торгуемый токен в MVP)
  membership/    регистрация баров + NFT-членство (Metaplex/cNFT — TODO)
  payments/      запись Solana Pay расчёта + источник proof-of-visit
  tournament/    escrow призового пула (ФАЗА 2, skill-based)
services/
  api/           бэкенд: API + индексер (Helius webhooks -> Postgres)
packages/
  sdk/           общие TS-клиенты программ (генерятся из IDL)
  config/        кластер + program IDs
docs/
  project-notes.md   рабочий блокнот проекта (решения + бэклог идей)
```

## Фазы
- 0 — каркас: монорепо, App Kit на обеих платформах, devnet, пустые программы деплоятся.
- 1 — грантовый MVP: один бар — membership + payments + loyalty (заработал/потратил).
- 2 — контент + голосование (skill-based) + tournament; геймификация (ранги), proof-of-visit cNFT.
- 3 — токенизация / вывод в фиат (только после юр. проработки).

## Как оживить (первые шаги)
```bash
# 1. зависимости (нужен pnpm)
pnpm install

# 2. on-chain
cd programs
anchor keys sync     # генерит уникальные program IDs и проставляет их (placeholder'ы заменятся)
anchor build
anchor deploy --provider.cluster devnet

# 3. бэкенд
pnpm --filter @cocktail/api dev

# 4. мобайл — скаффолд из Solana App Kit, см. apps/mobile/README.md
```

## ВАЖНО
- Код НЕ собирался в этой среде — это структурный скелет. Перед работой: `anchor build` у себя.
- `declare_id!` и program IDs сейчас placeholder'ы (одинаковые) — `anchor keys sync` проставит уникальные.
- Версия Anchor в Cargo.toml — ориентир; пни под свою (`anchor --version`).
