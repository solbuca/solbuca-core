use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("9XkouJjbZGywjF7b1k1bSTUdu4R2pNWDeL7ztXPQak5q");

/// Records a Solana Pay settlement at a bar AND moves the USDC atomically.
/// Points are awarded in step 2b (CPI to loyalty) — not yet here.
#[program]
pub mod payments {
    use super::*;

    pub fn pay_and_record(ctx: Context<PayAndRecord>, reference: Pubkey, amount: u64) -> Result<()> {
        require!(amount > 0, PaymentError::ZeroAmount);

        // 1. Перевод USDC: гость -> бар. Если упадёт — вся транзакция откатится.
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_ata.to_account_info(),
                to: ctx.accounts.bar_ata.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(cpi, amount)?;

        // 2. Зафиксировать факт расчёта.
        let s = &mut ctx.accounts.settlement;
        s.payer = ctx.accounts.payer.key();
        s.bar = ctx.accounts.bar.key();
        s.reference = reference;
        s.amount = amount;
        s.ts = Clock::get()?.unix_timestamp;
        emit!(Settled { payer: s.payer, bar: s.bar, amount, reference });
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
pub struct PayAndRecord<'info> {
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

    /// CHECK: bar identity; used as record field. ATA ownership checked below.
    pub bar: UncheckedAccount<'info>,

    // Токен-аккаунт гостя: должен принадлежать payer и быть в нужном минте.
    #[account(
        mut,
        constraint = payer_ata.owner == payer.key() @ PaymentError::BadPayerAta,
        constraint = payer_ata.mint == bar_ata.mint @ PaymentError::MintMismatch
    )]
    pub payer_ata: Account<'info, TokenAccount>,

    // Токен-аккаунт бара: должен принадлежать bar (риск 1 — нельзя платить себе).
    #[account(
        mut,
        constraint = bar_ata.owner == bar.key() @ PaymentError::BadBarAta
    )]
    pub bar_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum PaymentError {
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Payer ATA not owned by payer")]
    BadPayerAta,
    #[msg("Bar ATA not owned by bar")]
    BadBarAta,
    #[msg("Payer and bar token mints differ")]
    MintMismatch,
}
