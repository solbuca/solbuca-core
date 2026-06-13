use anchor_lang::prelude::*;
use membership::Bar;

declare_id!("ECegX1btskZDKbtXprf9ZrqFwETpqQr62Zh1iTCZhd8Z");

/// Loyalty points as non-transferable PDA balances (per user + bar).
/// NOT an SPL token in MVP — avoids securities exposure. Tokenization is phase 3.
#[program]
pub mod loyalty {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let acct = &mut ctx.accounts.loyalty;
        acct.user = ctx.accounts.user.key();
        acct.bar = ctx.accounts.bar.key();
        acct.points = 0;
        acct.bump = ctx.bumps.loyalty;
        Ok(())
    }

    /// Award points. Only the bar's authority (from the membership program) may call this.
    pub fn earn(ctx: Context<Mutate>, amount: u64) -> Result<()> {
        let acct = &mut ctx.accounts.loyalty;
        acct.points = acct.points.checked_add(amount).ok_or(LoyaltyError::Overflow)?;
        Ok(())
    }

    /// Redeem points. Only the bar's authority may call this (bar scans guest QR at redemption).
    pub fn redeem(ctx: Context<Mutate>, amount: u64) -> Result<()> {
        let acct = &mut ctx.accounts.loyalty;
        require!(acct.points >= amount, LoyaltyError::Insufficient);
        acct.points = acct.points.checked_sub(amount).ok_or(LoyaltyError::Overflow)?;
        Ok(())
    }
}

#[account]
pub struct Loyalty {
    pub user: Pubkey,
    pub bar: Pubkey,
    pub points: u64,
    pub bump: u8,
}
impl Loyalty {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = Loyalty::SIZE,
        seeds = [b"loyalty", user.key().as_ref(), bar.key().as_ref()],
        bump
    )]
    pub loyalty: Account<'info, Loyalty>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: bar pubkey used only as a PDA seed at init.
    pub bar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Mutate<'info> {
    #[account(
        mut,
        seeds = [b"loyalty", loyalty.user.as_ref(), loyalty.bar.as_ref()],
        bump = loyalty.bump,
        has_one = bar @ LoyaltyError::WrongBar
    )]
    pub loyalty: Account<'info, Loyalty>,

    // Bar account owned by the membership program; Anchor checks owner + PDA.
    #[account(
        seeds = [b"bar", bar.authority.as_ref()],
        bump = bar.bump,
        seeds::program = membership::ID,
        has_one = authority @ LoyaltyError::Unauthorized
    )]
    pub bar: Account<'info, Bar>,

    // Must be the bar's authority, and must sign.
    pub authority: Signer<'info>,
}

#[error_code]
pub enum LoyaltyError {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Insufficient points")]
    Insufficient,
    #[msg("Provided bar does not match loyalty.bar")]
    WrongBar,
    #[msg("Signer is not the bar authority")]
    Unauthorized,
}
