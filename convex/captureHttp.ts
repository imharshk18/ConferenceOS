import { getAuthUserId } from "@convex-dev/auth/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mediaType } from "../packages/core/capture";
function headers(request: Request) {
  const origin = request.headers.get("Origin");
  // Native requests have no Origin. Browser QA is local; additional hosts must be explicitly configured.
  const allowed = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || (process.env.CAPTURE_WEB_ORIGINS ?? "").split(",").includes(origin);
  if (!allowed) throw new Error("Origin not allowed");
  return { "Access-Control-Allow-Origin": origin ?? "*", "Access-Control-Allow-Methods": "POST,GET,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Upload-Key", "Cache-Control": "no-store", "Vary": "Origin" };
}
export const options = httpAction(async (_, request) => { try { return new Response(null, { status: 204, headers: headers(request) }); } catch { return new Response(null, { status: 403 }); } });
export const upload = httpAction(async (ctx, request) => {
  let cors; try { cors = headers(request); } catch { return new Response(null, { status: 403 }); }
  const reply = (body: string, status: number) => new Response(body, { status, headers: { ...cors, "Content-Type": "application/json" } });
  const userId = await getAuthUserId(ctx);
  if (!userId) return reply('{"error":"Sign in first"}', 401);
  let storageId: Id<"_storage"> | null = null;
  try {
    const captureId = new URL(request.url).searchParams.get("captureId") as Id<"captures">;
    const c = await ctx.runQuery(internal.captures.uploadContext, { captureId, userId });
    const uploadKey=request.headers.get('X-Upload-Key')??undefined;
    if(uploadKey&&!/^[a-zA-Z0-9_-]{8,100}$/.test(uploadKey))return reply('{"error":"Invalid upload identifier"}',400);
    if(uploadKey&&c.files.some(f=>f.uploadKey===uploadKey))return reply('{"ok":true}',200);
    if (c.status !== "collecting") return reply('{"error":"Capture is no longer accepting files"}', 409);
    let media;try{media = mediaType(request.headers.get("Content-Type") ?? "");}catch{return reply('{"error":"Unsupported attachment format. Please record again or choose JPEG/PNG."}',415);}
    if (Number(request.headers.get("Content-Length")) > media.max) return reply('{"error":"File too large"}', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing file");
    const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > media.max) { await reader.cancel(); return reply('{"error":"File too large"}', 413); }
      chunks.push(new Uint8Array(value));
    }
    if (!size) return reply('{"error":"The recording file is empty. Please record again."}',422);
    storageId = await ctx.storage.store(new Blob(chunks, { type: media.mime }));
    const attached=await ctx.runMutation(internal.captures.attach, { captureId, userId, storageId, mime: media.mime, size, uploadKey });
    if(!attached)await ctx.storage.delete(storageId);
    storageId = null;
    return reply('{"ok":true}', 200);
  } catch {
    if (storageId) await ctx.storage.delete(storageId);
    return reply('{"error":"Upload rejected. Check ownership, format and capture limits."}', 400);
  }
});
export const media = httpAction(async (ctx, request) => {
  let cors; try { cors = headers(request); } catch { return new Response(null, { status: 403 }); }
  const userId = await getAuthUserId(ctx);
  if (!userId) return new Response(null, { status: 401, headers: cors });
  try {
    const params = new URL(request.url).searchParams;
    const c = await ctx.runQuery(internal.captures.uploadContext, { captureId: params.get("captureId") as Id<"captures">, userId });
    const index = Number(params.get("index"));
    if (!Number.isInteger(index) || index < 0 || !c.files[index]) throw new Error("Missing file");
    const blob = await ctx.storage.get(c.files[index].storageId);
    return new Response(blob, { status: blob ? 200 : 404, headers: { ...cors, "Content-Type": c.files[index].mime, "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404, headers: cors }); }
});
