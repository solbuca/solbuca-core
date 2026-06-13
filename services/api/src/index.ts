import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

// TODO routes: bars, menu, bookings, leaderboard (off-chain data in Postgres)
// TODO indexer: subscribe to on-chain events (Helius webhooks) -> sync to Postgres
//   - payments::Settled -> visit / spend / loyalty mirror
//   - membership::Bar    -> bar registry + map markers

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
