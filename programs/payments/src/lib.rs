use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use loyalty::cpi::accounts::EarnViaPayment;
use loyalty::program::Loyalty as LoyaltyProgram;
use loyalty;

declare_id!("9XkouJjbZGywjF7b1k1bSTUdu4R2pNWDeL7ztXPQak5q");

/// 1 point per 1 whole USDC (USDC has 6 decimals). Integer division: fractional USDC earns no points
/// (e.g. 1.99 USDC -> 1 point). Make configurable later if a different rate is needed.
pub const POINTS_PER_USDC: u64 = 1;
const USDC_DECIMALS_FACTOR: u64 = 1_000_000;

/// TODO(mainnet): enforce that the payment mint is the real USDC mint.
/// On localnet/devnet we use a mock mint, so this check is NOT enabled yet.
/// Mainnet USDC mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
/// When ready, add a constraint: payer_ata.mint == USDC_MINT @ PaymentError::NotUsdc
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

#[program]
pub mod payments {
    use super::*;

    pub fn pay_and_record(ctx: Context<PayAndRecord>, reference: Pubkey, amount: u64) -> Result<()> {
        require!(amount > 0, PaymentError::ZeroAmount);

        // 1. Перевод USDC: гость -> бар (атомарно; упадёт -> всё откатится).
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_ata.to_account_info(),
                to: ctx.accounts.bar_ata.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(cpi, amount)?;

        // 2. Зафиксировать расчёт.
        let s = &mut ctx.accounts.settlement;
        s.payer = ctx.accounts.payer.key();
        s.bar = ctx.accounts.bar.key();
        s.reference = reference;
        s.amount = amount;
        s.ts = Clock::get()?.unix_timestamp;
        emit!(Settled { payer: s.payer, bar: s.bar, amount, reference });

        // 3. Начислить баллы через CPI в loyalty, подписав authority-PDA программы payments.
        let points = (amount / USDC_DECIMALS_FACTOR).saturating_mul(POINTS_PER_USDC);
        if points > 0 {
            let bump = ctx.bumps.payments_authority;
            let seeds: &[&[u8]] = &[b"authority", &[bump]];
            let signer: &[&[&[u8]]] = &[seeds];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.loyalty_program.to_account_info(),
                EarnViaPayment {
                    loyalty: ctx.accounts.loyalty.to_account_info(),
                    payments_authority: ctx.accounts.payments_authority.to_account_info(),
                },
                signer,
            );
            loyalty::cpi::earn_via_payment(cpi_ctx, points)?;
        }
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

    /// CHECK: bar identity; used as record field + loyalty PDA seed.
    pub bar: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = payer_ata.owner == payer.key() @ PaymentError::BadPayerAta,
        constraint = payer_ata.mint == bar_ata.mint @ PaymentError::MintMismatch
    )]
    pub payer_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = bar_ata.owner == bar.key() @ PaymentError::BadBarAta
    )]
    pub bar_ata: Account<'info, TokenAccount>,

    // Loyalty PDA для (payer, bar) — выводится теми же seeds, что в программе loyalty.
    // Подменить на чужой нельзя: Anchor проверяет вывод PDA в loyalty по owner.
    /// CHECK: validated by the loyalty program via its own seeds on CPI.
    #[account(mut)]
    pub loyalty: UncheckedAccount<'info>,

    // PDA-подпись payments для авторизации начисления в loyalty.
    /// CHECK: PDA signer for the loyalty CPI; derived from "authority".
    #[account(seeds = [b"authority"], bump)]
    pub payments_authority: UncheckedAccount<'info>,

    pub loyalty_program: Program<'info, LoyaltyProgram>,
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
