import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

describe("payments + loyalty CPI (2b)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payments = anchor.workspace.payments as Program;
  const loyalty = anchor.workspace.loyalty as Program;
  const membership = anchor.workspace.membership as Program;

  const payer = (provider.wallet as anchor.Wallet).payer; // гость
  const barAuth = Keypair.generate();

  let mint: PublicKey, payerAta: PublicKey, barAta: PublicKey;
  let barPda: PublicKey, loyaltyPda: PublicKey, paymentsAuthority: PublicKey;

  before(async () => {
    // бар в membership
    const sig = await provider.connection.requestAirdrop(barAuth.publicKey, 2e9);
    await provider.connection.confirmTransaction(sig);
    [barPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bar"), barAuth.publicKey.toBuffer()], membership.programId);
    await membership.methods.registerBar("CPI Bar", true)
      .accounts({ bar: barPda, authority: barAuth.publicKey, systemProgram: SystemProgram.programId })
      .signers([barAuth]).rpc();

    // loyalty для (payer, barPda)
    [loyaltyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("loyalty"), payer.publicKey.toBuffer(), barPda.toBuffer()], loyalty.programId);
    await loyalty.methods.initialize()
      .accounts({ loyalty: loyaltyPda, user: payer.publicKey, bar: barPda, systemProgram: SystemProgram.programId })
      .rpc();

    // payments authority PDA
    [paymentsAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority")], payments.programId);

    // мок-USDC + ATA + баланс гостю
    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    payerAta = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, payer.publicKey)).address;
    barAta = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, barAuth.publicKey)).address;
    await mintTo(provider.connection, payer, mint, payerAta, payer, 1_000_000_000);
  });

  it("pay 100 USDC -> бар получил деньги И гостю начислены баллы (атомарно)", async () => {
    const reference = Keypair.generate().publicKey;
    const [settlementPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("settlement"), reference.toBuffer()], payments.programId);

    const pointsBefore = (await loyalty.account.loyalty.fetch(loyaltyPda)).points.toNumber();
    const barBefore = (await getAccount(provider.connection, barAta)).amount;

    await payments.methods
      .payAndRecord(reference, new anchor.BN(100_000_000)) // 100 USDC
      .accounts({
        settlement: settlementPda,
        payer: payer.publicKey,
        bar: barAuth.publicKey,
        payerAta, barAta,
        loyalty: loyaltyPda,
        paymentsAuthority,
        loyaltyProgram: loyalty.programId,
        tokenProgram: TOKEN_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const barAfter = (await getAccount(provider.connection, barAta)).amount;
    const pointsAfter = (await loyalty.account.loyalty.fetch(loyaltyPda)).points.toNumber();

    assert.equal(barAfter - barBefore, 100_000_000n, "бар получил 100 USDC");
    assert.equal(pointsAfter - pointsBefore, 100, "гостю начислено 100 баллов (1 за USDC)");
  });

  it("NEGATIVE: прямой earn_via_payment без payments-PDA -> падает", async () => {
    try {
      await loyalty.methods
        .earnViaPayment(new anchor.BN(999))
        .accounts({ loyalty: loyaltyPda, paymentsAuthority })
        .rpc(); // подписывает обычный кошелёк, а не payments-PDA
      assert.fail("прямой вызов должен был упасть");
    } catch (e: any) {
      assert.match(e.toString(), /seeds|ConstraintSeeds|signature|privilege|Signer|missing/i);
    }
  });
});

// Негативные тесты на защиты payments (риски 1, 3, 4-bis).
describe("payments — negative (constraints)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payments = anchor.workspace.payments as Program;
  const loyalty = anchor.workspace.loyalty as Program;
  const membership = anchor.workspace.membership as Program;

  const payer = (provider.wallet as anchor.Wallet).payer;
  const barAuth = Keypair.generate();
  const attacker = Keypair.generate();

  let mintA: PublicKey, mintB: PublicKey;
  let payerAtaA: PublicKey, barAtaA: PublicKey;
  let attackerAtaA: PublicKey, payerAtaB: PublicKey;
  let barPda: PublicKey, loyaltyPda: PublicKey, paymentsAuthority: PublicKey;

  before(async () => {
    for (const kp of [barAuth, attacker]) {
      const s = await provider.connection.requestAirdrop(kp.publicKey, 2e9);
      await provider.connection.confirmTransaction(s);
    }

    [barPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bar"), barAuth.publicKey.toBuffer()], membership.programId);
    await membership.methods.registerBar("Neg Bar", true)
      .accounts({ bar: barPda, authority: barAuth.publicKey, systemProgram: SystemProgram.programId })
      .signers([barAuth]).rpc();

    [loyaltyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("loyalty"), payer.publicKey.toBuffer(), barPda.toBuffer()], loyalty.programId);
    await loyalty.methods.initialize()
      .accounts({ loyalty: loyaltyPda, user: payer.publicKey, bar: barPda, systemProgram: SystemProgram.programId })
      .rpc();

    [paymentsAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority")], payments.programId);

    // Два разных минта.
    mintA = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    mintB = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    payerAtaA = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mintA, payer.publicKey)).address;
    barAtaA   = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mintA, barAuth.publicKey)).address;
    attackerAtaA = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mintA, attacker.publicKey)).address;
    payerAtaB = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mintB, payer.publicKey)).address;

    await mintTo(provider.connection, payer, mintA, payerAtaA, payer, 1_000_000_000);
    await mintTo(provider.connection, payer, mintB, payerAtaB, payer, 1_000_000_000);
  });

  // РИСК 1: bar_ata принадлежит не бару, а атакующему -> BadBarAta.
  it("NEGATIVE: bar_ata принадлежит атакующему -> падает (BadBarAta)", async () => {
    const reference = Keypair.generate().publicKey;
    const [settlementPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("settlement"), reference.toBuffer()], payments.programId);
    try {
      await payments.methods.payAndRecord(reference, new anchor.BN(50_000_000))
        .accounts({
          settlement: settlementPda, payer: payer.publicKey, bar: barAuth.publicKey,
          payerAta: payerAtaA, barAta: attackerAtaA, // <- ATA атакующего вместо бара
          loyalty: loyaltyPda, paymentsAuthority,
          loyaltyProgram: loyalty.programId, tokenProgram: TOKEN_PROGRAM, systemProgram: SystemProgram.programId,
        }).rpc();
      assert.fail("оплата на чужой ATA должна была упасть");
    } catch (e: any) {
      assert.match(e.toString(), /BadBarAta|constraint|owner/i);
    }
  });

  // РИСК 3: payer_ata и bar_ata в разных минтах -> MintMismatch.
  it("NEGATIVE: разные минты payer/bar -> падает (MintMismatch)", async () => {
    const reference = Keypair.generate().publicKey;
    const [settlementPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("settlement"), reference.toBuffer()], payments.programId);

    // bar_ata в mintB, чтобы отличался от payer_ata (mintB) — но payer платит с mintA
    const barAtaB = (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mintB, barAuth.publicKey)).address;
    try {
      await payments.methods.payAndRecord(reference, new anchor.BN(50_000_000))
        .accounts({
          settlement: settlementPda, payer: payer.publicKey, bar: barAuth.publicKey,
          payerAta: payerAtaA, barAta: barAtaB, // payer в mintA, bar в mintB
          loyalty: loyaltyPda, paymentsAuthority,
          loyaltyProgram: loyalty.programId, tokenProgram: TOKEN_PROGRAM, systemProgram: SystemProgram.programId,
        }).rpc();
      assert.fail("разные минты должны были упасть");
    } catch (e: any) {
      assert.match(e.toString(), /MintMismatch|constraint|mint/i);
    }
  });

  // РИСК 4-bis: подмена loyalty на чужой PDA -> CPI в loyalty не сойдётся по seeds.
  it("NEGATIVE: чужой loyalty-PDA -> падает (seeds на стороне loyalty)", async () => {
    // loyalty для другого бара (attacker как authority)
    const [attackerBarPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bar"), attacker.publicKey.toBuffer()], membership.programId);
    await membership.methods.registerBar("Attacker Bar", true)
      .accounts({ bar: attackerBarPda, authority: attacker.publicKey, systemProgram: SystemProgram.programId })
      .signers([attacker]).rpc();
    const [foreignLoyalty] = PublicKey.findProgramAddressSync(
      [Buffer.from("loyalty"), payer.publicKey.toBuffer(), attackerBarPda.toBuffer()], loyalty.programId);
    await loyalty.methods.initialize()
      .accounts({ loyalty: foreignLoyalty, user: payer.publicKey, bar: attackerBarPda, systemProgram: SystemProgram.programId })
      .rpc();

    const reference = Keypair.generate().publicKey;
    const [settlementPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("settlement"), reference.toBuffer()], payments.programId);
    try {
      // платим бару barPda, но подсовываем loyalty другого бара
      await payments.methods.payAndRecord(reference, new anchor.BN(50_000_000))
        .accounts({
          settlement: settlementPda, payer: payer.publicKey, bar: barAuth.publicKey,
          payerAta: payerAtaA, barAta: barAtaA,
          loyalty: foreignLoyalty, // <- чужой loyalty
          paymentsAuthority,
          loyaltyProgram: loyalty.programId, tokenProgram: TOKEN_PROGRAM, systemProgram: SystemProgram.programId,
        }).rpc();
      assert.fail("чужой loyalty должен был упасть");
    } catch (e: any) {
      assert.match(e.toString(), /seeds|ConstraintSeeds|loyalty|constraint/i);
    }
  });
});
