use anchor_lang::prelude::*;

declare_id!("51XxAr16XmsU8foURdo664JDD1q67MsVTN3JjfWiP2Ja"); // placeholder

/// PHASE 2 — skeleton only.
/// Skill-based judging (NOT stake-on-outcome) to keep clear of gambling framing.
#[program]
pub mod tournament {
    use super::*;

    pub fn create(_ctx: Context<Create>) -> Result<()> {
        // TODO: init tournament pool + escrow vault, set judging window & criteria.
        Ok(())
    }

    pub fn submit_entry(_ctx: Context<Entry>) -> Result<()> {
        // TODO: paid recipe/video entry -> funds into escrow.
        Ok(())
    }

    pub fn resolve(_ctx: Context<Resolve>) -> Result<()> {
        // TODO: skill-based result set by authority / oracle (transparent criteria).
        Ok(())
    }

    pub fn distribute(_ctx: Context<Resolve>) -> Result<()> {
        // TODO: payout winners from escrow.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Create<'info> {
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Entry<'info> {
    pub entrant: Signer<'info>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    pub authority: Signer<'info>,
}
