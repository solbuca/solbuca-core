use anchor_lang::prelude::*;

declare_id!("9XkouJjbZGywjF7b1k1bSTUdu4R2pNWDeL7ztXPQak5q"); // placeholder

/// Records a Solana Pay settlement at a bar. The USDC transfer itself is built
/// off-chain as a Solana Pay transaction request; this anchors the record and is
/// the proof-of-visit source.
#[program]
pub mod payments {
    use super::*;

    pub fn record_settlement(ctx: Context<RecordSettlement>, reference: Pubkey, amount: u64) -> Result<()> {
        let s = &mut ctx.accounts.settlement;
        s.payer = ctx.accounts.payer.key();
        s.bar = ctx.accounts.bar.key();
        s.reference = reference;
        s.amount = amount;
        s.ts = Clock::get()?.unix_timestamp;
        emit!(Settled { payer: s.payer, bar: s.bar, amount, reference });
        // TODO: CPI -> loyalty::earn (award points); mint visit cNFT (proof-of-visit).
        Ok(())
    }
}

#[account]
pub struct Settlement {
    pub payer: Pubkey,
    pub bar: Pubkey,
    pub reference: Pubkey,
    pub amount: u64,
    pub ts: i64,
}
impl Settlement {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 8;
}

#[event]
pub struct Settled {
    pub payer: Pubkey,
    pub bar: Pubkey,
    pub amount: u64,
    pub reference: Pubkey,
}

#[derive(Accounts)]
#[instruction(reference: Pubkey)]
pub struct RecordSettlement<'info> {
    #[account(
        init,
        payer = payer,
        space = Settlement::SIZE,
        seeds = [b"settlement", reference.as_ref()],
        bump
    )]
    pub settlement: Account<'info, Settlement>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: bar pubkey used as a record field / seed input.
    pub bar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
