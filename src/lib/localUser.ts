/**
 * The fallback id every write path uses when nobody's signed in (see
 * TASKS.md — no real auth existed at all until this session, and even now
 * plenty of local/dev usage is intentionally auth-free). Centralised here
 * rather than the literal string repeated at each view's own
 * `session.session?.user.id ?? 'local-dev-user'` line, because
 * claimLocalData.ts needs to search Dexie for rows owned by EXACTLY this
 * value — a second, independently-typed copy of the string would be one
 * typo away from silently never matching anything.
 */
export const LOCAL_DEV_USER_ID = 'local-dev-user'
