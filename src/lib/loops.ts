const LOOPS_API_BASE = 'https://app.loops.so/api/v1'

export type LoopsMailingListMap = Record<string, boolean>

export type LoopsUpdateContactPayload = {
  email: string
  userId?: string
  firstName?: string
  mailingLists?: LoopsMailingListMap
}

export type LoopsApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; message: string; status: number }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** PUT /contacts/update — creates or updates a contact (see Loops docs). */
export async function loopsUpdateContact(
  apiKey: string,
  payload: LoopsUpdateContactPayload,
): Promise<LoopsApiResult<{ success: boolean; id?: string; message?: string }>> {
  let lastStatus = 500
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${LOOPS_API_BASE}/contacts/update`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    lastStatus = res.status
    if (res.status === 429) {
      const wait = 500 * 2 ** attempt
      await sleep(Math.min(wait, 8000))
      continue
    }
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      id?: string
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: typeof data.message === 'string' ? data.message : res.statusText,
      }
    }
    if (data && data.success === false) {
      return {
        ok: false,
        status: res.status,
        message: typeof data.message === 'string' ? data.message : 'Loops rejected contact update',
      }
    }
    return { ok: true, status: res.status, data: data as { success: boolean; id?: string } }
  }
  return { ok: false, status: lastStatus, message: 'Rate limited after retries' }
}

/** GET — list mailing lists (ids for LOOPS_MAILING_LIST_IDS). */
export async function loopsListMailingLists(
  apiKey: string,
): Promise<LoopsApiResult<Array<{ id: string; name: string; description: string | null; isPublic: boolean }>>> {
  const res = await fetch(`${LOOPS_API_BASE}/lists`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: typeof data?.message === 'string' ? data.message : res.statusText,
    }
  }
  if (!Array.isArray(data)) {
    return { ok: false, status: res.status, message: 'Unexpected lists response' }
  }
  return { ok: true, status: res.status, data }
}

export type LoopsTransactionalPayload = {
  email: string
  transactionalId: string
  dataVariables: Record<string, unknown>
}

/** POST /v1/transactional — send a transactional email (see Loops docs). */
export async function loopsSendTransactional(
  apiKey: string,
  payload: LoopsTransactionalPayload,
  options?: { idempotencyKey?: string },
): Promise<LoopsApiResult<{ success?: boolean; message?: string }>> {
  let lastStatus = 500
  for (let attempt = 0; attempt < 6; attempt++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey.slice(0, 100)
    }
    const res = await fetch(`${LOOPS_API_BASE}/transactional`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    lastStatus = res.status
    if (res.status === 429) {
      const wait = 500 * 2 ** attempt
      await sleep(Math.min(wait, 8000))
      continue
    }
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: typeof data.message === 'string' ? data.message : res.statusText,
      }
    }
    if (data && data.success === false) {
      return {
        ok: false,
        status: res.status,
        message: typeof data.message === 'string' ? data.message : 'Loops rejected transactional send',
      }
    }
    return { ok: true, status: res.status, data }
  }
  return { ok: false, status: lastStatus, message: 'Rate limited after retries' }
}

export type LoopsSendEventPayload = {
  email?: string
  userId?: string
  eventName: string
  /** String, number, boolean, or ISO date per Loops docs. */
  eventProperties?: Record<string, string | number | boolean>
}

/** POST /v1/events/send — triggers Loop(s) subscribed to this event (see Loops docs). */
export async function loopsSendEvent(
  apiKey: string,
  payload: LoopsSendEventPayload,
  options?: { idempotencyKey?: string },
): Promise<LoopsApiResult<{ success?: boolean; message?: string }>> {
  let lastStatus = 500
  for (let attempt = 0; attempt < 6; attempt++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey.slice(0, 100)
    }
    const res = await fetch(`${LOOPS_API_BASE}/events/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    lastStatus = res.status
    if (res.status === 429) {
      const wait = 500 * 2 ** attempt
      await sleep(Math.min(wait, 8000))
      continue
    }
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: typeof data.message === 'string' ? data.message : res.statusText,
      }
    }
    if (data && data.success === false) {
      return {
        ok: false,
        status: res.status,
        message: typeof data.message === 'string' ? data.message : 'Loops rejected event',
      }
    }
    return { ok: true, status: res.status, data }
  }
  return { ok: false, status: lastStatus, message: 'Rate limited after retries' }
}

export function parseMailingListIds(raw: string | undefined): LoopsMailingListMap | undefined {
  if (!raw?.trim()) return undefined
  const ids = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return undefined
  return Object.fromEntries(ids.map((id) => [id, true]))
}
