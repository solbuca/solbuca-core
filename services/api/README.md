# @cocktail/api

Бэкенд: REST/GraphQL API + индексер ончейн-событий.

- `src/routes/`  — bars, menu, bookings, leaderboard (off-chain данные)
- `src/indexer/` — слушает события программ (Helius webhooks) и пишет в Postgres
- Стек-ориентир: Fastify + Postgres (Prisma/Drizzle на выбор).

Запуск: `pnpm --filter @cocktail/api dev`
