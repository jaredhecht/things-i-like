export function isResendDisabled() {
  const value = process.env.RESEND_DISABLED?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}
