import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("payments (pay_and_record 2a)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payments = anchor.workspace.payments as Program;

  const payer = (provider.wallet as anchor.Wallet).payer; // гость = кошелёк провайдера
  const bar = Keypair.generate();                          // бар (получатель)

  let mint: PublicKey;
  let payerAta: PublicKey;
  let barAta: PublicKey;

  before(async () => {
    // мок-USDC: 6 знаков, как у настоящего USDC
    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    payerAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, mint, payer.publicKey)).address;
    barAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, mint, bar.publicKey)).address;

    // начеканим гостю 1000 USDC (1000 * 10^6)
    await mintTo(provider.connection, payer, mint, payerAta, payer, 1_000_000_000);
  });

  const reference = Keypair.generate().publicKey;
  const [settlementPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement"), reference.toBuffer()],
    payments.programId
  );

  it("pay 100 USDC: баланс перемещается, Settlement создан", async () => {
    const amount = new anchor.BN(100_000_000); // 100 USDC

    const barBefore = (await getAccount(provider.connection, barAta)).amount;

    await payments.methods
      .payAndRecord(reference, amount)
      .accounts({
        settlement: settlementPda,
        payer: payer.publicKey,
        bar: bar.publicKey,
        payerAta, barAta,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const barAfter = (await getAccount(provider.connection, barAta)).amount;
    assert.equal(barAfter - barBefore, 100_000_000n, "бар получил 100 USDC");

    const s = await payments.account.settlement.fetch(settlementPda);
    assert.equal(s.amount.toNumber(), 100_000_000);
    assert.ok(s.bar.equals(bar.publicKey));
  });

  it("NEGATIVE: тот же reference повторно -> падает (double-spend защита)", async () => {
    try {
      await payments.methods
        .payAndRecord(reference, new anchor.BN(100_000_000))
        .accounts({
          settlement: settlementPda,
          payer: payer.publicKey,
          bar: bar.publicKey,
          payerAta, barAta,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("повторный reference должен был упасть");
    } catch (e: any) {
      // Settlement PDA уже существует -> ошибка инициализации аккаунта
      assert.match(e.toString(), /already in use|custom program error|0x0/i);
    }
  });
});
