export const invitationCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const invitationCodeLength = 8;

// Standard codes never use zero, so the two code types have distinct formats.
export const shortFundedCodePrefix = '0';
export const shortFundedCodePattern = new RegExp(`^${shortFundedCodePrefix}[${invitationCodeAlphabet}]{${invitationCodeLength - 1}}$`);
export const legacyFundedCodePrefix = 'BONUS-';
export const legacyFundedCodePattern = new RegExp(`^${legacyFundedCodePrefix}[A-Z2-9]{20}$`);
