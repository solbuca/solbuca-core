import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("loyalty (authz)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const loyalty = anchor.workspace.loyalty as Program;
  const membership = anchor.workspace.membership as Program;

  const user = provider.wallet.publicKey;
  const barAuthority = Keypair.generate();   // владелец бара
  const attacker = Keypair.generate();        // чужой

  // PDA бара в программе membership: seeds = ["bar", barAuthority]
  const [barPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bar"), barAuthority.publicKey.toBuffer()],
    membership.programId
  );

  // PDA лояльности: seeds = ["loyalty", user, barPda]
  const [loyaltyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("loyalty"), user.toBuffer(), barPda.toBuffer()],
    loyalty.programId
  );

  it("register bar in membership", async () => {
    // даём бару немного SOL на оплату аренды аккаунта
    const sig = await provider.connection.requestAirdrop(
      barAuthority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    await membership.methods
      .registerBar("Test Bar", true)
      .accounts({ bar: barPda, authority: barAuthority.publicKey, systemProgram: SystemProgram.programId })
      .signers([barAuthority])
      .rpc();

    const bar = await membership.account.bar.fetch(barPda);
    assert.ok(bar.authority.equals(barAuthority.publicKey));
    assert.equal(bar.onContract, true);
  });

  it("initialize loyalty -> points = 0", async () => {
    await loyalty.methods
      .initialize()
      .accounts({ loyalty: loyaltyPda, user, bar: barPda, systemProgram: SystemProgram.programId })
      .rpc();

    const acc = await loyalty.account.loyalty.fetch(loyaltyPda);
    assert.equal(acc.points.toNumber(), 0);
    assert.ok(acc.bar.equals(barPda));
  });

  it("bar authority earns 150 -> points = 150", async () => {
    await loyalty.methods
      .earn(new anchor.BN(150))
      .accounts({ loyalty: loyaltyPda, bar: barPda, authority: barAuthority.publicKey })
      .signers([barAuthority])
      .rpc();

    const acc = await loyalty.account.loyalty.fetch(loyaltyPda);
    assert.equal(acc.points.toNumber(), 150);
  });

  it("NEGATIVE: attacker cannot earn (not bar authority)", async () => {
    const sig = await provider.connection.requestAirdrop(
      attacker.publicKey, anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    try {
      await loyalty.methods
        .earn(new anchor.BN(1000))
        .accounts({ loyalty: loyaltyPda, bar: barPda, authority: attacker.publicKey })
        .signers([attacker])
        .rpc();
      assert.fail("attacker earn должен был упасть");
    } catch (e: any) {
      // has_one = authority -> ConstraintHasOne / Unauthorized
      assert.match(e.toString(), /Unauthorized|ConstraintHasOne|has one/i);
    }
  });

  it("bar authority redeems 50 -> points = 100", async () => {
    await loyalty.methods
      .redeem(new anchor.BN(50))
      .accounts({ loyalty: loyaltyPda, bar: barPda, authority: barAuthority.publicKey })
      .signers([barAuthority])
      .rpc();

    const acc = await loyalty.account.loyalty.fetch(loyaltyPda);
    assert.equal(acc.points.toNumber(), 100);
  });

  it("NEGATIVE: redeem more than balance fails", async () => {
    try {
      await loyalty.methods
        .redeem(new anchor.BN(999))
        .accounts({ loyalty: loyaltyPda, bar: barPda, authority: barAuthority.publicKey })
        .signers([barAuthority])
        .rpc();
      assert.fail("redeem 999 должен был упасть");
    } catch (e: any) {
      assert.match(e.toString(), /Insufficient/i);
    }
  });
});

// Доп. негативный кейс: атака подменой бара.
describe("loyalty (authz) — bar substitution", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const loyalty = anchor.workspace.loyalty as anchor.Program;
  const membership = anchor.workspace.membership as anchor.Program;

  const user = provider.wallet.publicKey;
  const barA_auth = anchor.web3.Keypair.generate();   // легальный бар A
  const barB_auth = anchor.web3.Keypair.generate();   // бар B злоумышленника

  const [barA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("bar"), barA_auth.publicKey.toBuffer()],
    membership.programId
  );
  const [barB] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("bar"), barB_auth.publicKey.toBuffer()],
    membership.programId
  );
  // loyalty пользователя привязан к бару A
  const [loyaltyA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("loyalty"), user.toBuffer(), barA.toBuffer()],
    loyalty.programId
  );

  it("setup: оба бара зарегистрированы, loyalty привязан к бару A", async () => {
    for (const kp of [barA_auth, barB_auth]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    await membership.methods.registerBar("Bar A", true)
      .accounts({ bar: barA, authority: barA_auth.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .signers([barA_auth]).rpc();
    await membership.methods.registerBar("Bar B (attacker)", true)
      .accounts({ bar: barB, authority: barB_auth.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .signers([barB_auth]).rpc();
    await loyalty.methods.initialize()
      .accounts({ loyalty: loyaltyA, user, bar: barA, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();

    const acc = await loyalty.account.loyalty.fetch(loyaltyA);
    assert.ok(acc.bar.equals(barA));
  });

  it("NEGATIVE: attacker не может начислить на loyaltyA, подсунув свой барB", async () => {
    try {
      await loyalty.methods.earn(new anchor.BN(1000))
        .accounts({ loyalty: loyaltyA, bar: barB, authority: barB_auth.publicKey })
        .signers([barB_auth]).rpc();
      assert.fail("подмена бара должна была упасть");
    } catch (e: any) {
      // успех защиты: WrongBar (has_one) ИЛИ ConstraintSeeds — любая отбивает атаку
      assert.match(e.toString(), /WrongBar|ConstraintSeeds|ConstraintHasOne|seeds|has one/i);
    }
  });
});
