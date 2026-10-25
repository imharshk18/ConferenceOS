const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const PAYLOAD =
  /^conferenceos:\/\/connect\?code=([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})$/;

export function invitationPayload(code: string, runtimeBase?: string): string {
  if (code.length !== 8 || !CODE.test(code))
    throw new Error("Invalid ConferenceOS invitation code");
  if (runtimeBase && (!/^(exp|exps|https?|conferenceos):\/\//.test(runtimeBase) || /[?#@\s]/.test(runtimeBase))) throw new Error("Invalid invitation base");
  // `code` is reserved by Convex Auth's OAuth callback on web.
  return runtimeBase ? `${runtimeBase}?invite=${code}` : `conferenceos://connect?code=${code}`;
}

/** QR payloads are data only: never navigate to scanned arbitrary URLs. */
export function parseInvitationPayload(payload: string, runtimeBase?: string): string | null {
  if (payload.length > 512) return null;
  // Runtime base is generated locally by Expo, never taken from the received URL.
  if (runtimeBase && payload.startsWith(`${runtimeBase}?invite=`)) {
    const code = payload.slice(runtimeBase.length + 8);
    return code.length === 8 && CODE.test(code) ? code : null;
  }
  const match = PAYLOAD.exec(payload);
  return match && match[0] === payload ? match[1] : null;
}
