import { createClient } from '@supabase/supabase-js'
import { verifyWeeklyDigestUnsubscribeToken } from '@/src/lib/happening-things-weekly'

export const runtime = 'nodejs'

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#18181b;"><div style="max-width:560px;margin:0 auto;padding:48px 20px;"><div style="background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:28px 24px;">${body}</div></div></body></html>`,
    {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
}

async function handle(request: Request) {
  const url = new URL(request.url)
  const userId = url.searchParams.get('u')?.trim() || ''
  const token = url.searchParams.get('t')?.trim() || ''
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const secret = process.env.WEEKLY_DIGEST_UNSUBSCRIBE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || ''

  if (!userId || !token || !secret || !supabaseUrl || !serviceRoleKey) {
    return html(
      '<h1 style="font-size:24px;margin:0 0 12px;">This unsubscribe link is invalid.</h1><p style="color:#52525b;line-height:1.6;">Try again from the latest weekly email, or sign in and change it in Settings.</p>',
      400,
    )
  }

  if (!verifyWeeklyDigestUnsubscribeToken(userId, token, secret)) {
    return html(
      '<h1 style="font-size:24px;margin:0 0 12px;">This unsubscribe link is invalid.</h1><p style="color:#52525b;line-height:1.6;">Try again from the latest weekly email, or sign in and change it in Settings.</p>',
      400,
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.from('profiles').update({ weekly_digest_enabled: false }).eq('id', userId)
  if (error) {
    const extra = /weekly_digest_enabled/i.test(error.message)
      ? ' Run supabase/weekly-digest-email.sql first, then try again.'
      : ''
    return html(
      `<h1 style="font-size:24px;margin:0 0 12px;">We could not update your preference.</h1><p style="color:#52525b;line-height:1.6;">${error.message}${extra}</p>`,
      500,
    )
  }

  return html(
    '<h1 style="font-size:24px;margin:0 0 12px;">You are unsubscribed.</h1><p style="color:#52525b;line-height:1.6;">You will no longer receive the weekly Things I Like update. You can turn it back on anytime in Settings.</p><p style="margin-top:20px;"><a href="https://thingsilike.app/settings" style="color:#18181b;">Open Settings</a></p>',
  )
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
