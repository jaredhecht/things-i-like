import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/** Civil YYYY-MM-DD minus N days (calendar math on the string components' date). */
function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * "Yesterday" for the digest: full calendar day in `ADMIN_DIGEST_TIMEZONE` (default America/New_York),
 * expressed as [start, end) in UTC for querying `created_at`.
 */
export function getDigestWindow(now = new Date()): {
  label: string
  startIso: string
  endExclusiveIso: string
  timezone: string
} {
  const tz = process.env.ADMIN_DIGEST_TIMEZONE || 'America/New_York'
  const todayYmd = formatInTimeZone(now, tz, 'yyyy-MM-dd')
  const yesterdayYmd = ymdMinusDays(todayYmd, 1)
  const startIso = fromZonedTime(`${yesterdayYmd}T00:00:00`, tz).toISOString()
  const endExclusiveIso = fromZonedTime(`${todayYmd}T00:00:00`, tz).toISOString()
  return {
    label: yesterdayYmd,
    startIso,
    endExclusiveIso,
    timezone: tz,
  }
}
