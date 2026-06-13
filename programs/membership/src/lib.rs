use anchor_lang::prelude::*;

declare_id!("9nDXZ8Stgpr9J8NsfwP8wLSnExG4iGTJuCCVXKhF5SbP"); // placeholder

/// Partner bar registry + membership. The collectible membership NFT
/// ("злой логотип") is minted via Metaplex Core / Bubblegum cNFT in implementation.
#[program]
pub mod membership {
    use super::*;

    pub fn register_bar(ctx: Context<RegisterBar>, name: String, on_contract: bool) -> Result<()> {
        require!(name.len() <= 64, MembershipError::NameTooLong);
        let bar = &mut ctx.accounts.bar;
        bar.authority = ctx.accounts.authority.key();
        bar.name = name;
        bar.on_contract = on_contract;
        bar.bump = ctx.bumps.bar;
        Ok(())
    }

    pub fn set_contract_status(ctx: Context<UpdateBar>, on_contract: bool) -> Result<()> {
        ctx.accounts.bar.on_contract = on_contract;
        Ok(())
    }

    // TODO: mint_membership_nft -> Metaplex Core (or Bubblegum cNFT) collectible bar membership.
}

#[account]
pub struct Bar {
    pub authority: Pubkey,
    pub on_contract: bool,
    pub bump: u8,
    pub name: String, // <= 64 bytes
}
impl Bar {
    pub const SIZE: usize = 8 + 32 + 1 + 1 + 4 + 64;
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterBar<'info> {
    #[account(
        init,
        payer = authority,
        space = Bar::SIZE,
        seeds = [b"bar", authority.key().as_ref()],
        bump
    )]
    pub bar: Account<'info, Bar>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateBar<'info> {
    #[account(mut, has_one = authority, seeds = [b"bar", authority.key().as_ref()], bump = bar.bump)]
    pub bar: Account<'info, Bar>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum MembershipError {
    #[msg("Bar name too long (max 64 bytes)")]
    NameTooLong,
}
