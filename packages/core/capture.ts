import { validTopicIds } from "./intelligence";
import { validNetworkAreas, NETWORK_AREAS } from "./network";
export type ContextDraft = { summary: string; topicIds: string[]; networkAreas?: string[]; takeaways: string[]; actions: string[] };
export const AUDIO_TYPES = ["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/webm", "video/webm"];
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function mediaType(raw: string) {
  const mime = raw.toLowerCase().split(";")[0].trim();
  if (IMAGE_TYPES.includes(mime)) return { mime, kind: "image" as const, max: 4 * 1024 * 1024 };
  if (AUDIO_TYPES.includes(mime)) return { mime, kind: "audio" as const, max: 8 * 1024 * 1024 };
  throw new Error("Use JPEG, PNG, WebP, M4A, MP3, WAV or WebM");
}
export function cleanDraft(value: ContextDraft): ContextDraft {
  const text = (s: string, max: number) => {
    const t = s.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
    if (!t || t.length > max) throw new Error("Review the draft length before saving");
    return t;
  };
  if (value.takeaways.length > 5 || value.actions.length > 5 || value.topicIds.length > 6) throw new Error("Keep up to five takeaways and five actions");
  const topicIds = validTopicIds(value.topicIds);
  if (topicIds.length !== new Set(value.topicIds).size) throw new Error("Choose available topics");
  return { summary: text(value.summary, 1000), topicIds, networkAreas: validNetworkAreas(value.networkAreas ?? topicIds), takeaways: value.takeaways.map(s => text(s, 200)), actions: value.actions.map(s => text(s, 200)) };
}
/** Keep the accepted summary, learning and suggestions together in the reviewed shared context. */
export function memoryText(draft: ContextDraft) {
  return [draft.summary, ...draft.takeaways.map(s => `Takeaway: ${s}`), ...draft.actions.map(s => `Suggested next step: ${s}`)].join("\n").slice(0, 1600);
}
export const DRAFT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["summary", "topicIds", "networkAreas", "takeaways", "actions"],
  properties: {
    summary: { type: "string" },
    topicIds: { type: "array", items: { type: "string", enum: ["ai", "opensource", "platform", "security", "graph", "devex"] } },
    networkAreas: { type: "array", items: { type: "string", enum: NETWORK_AREAS.map(a => a.id) } },
    takeaways: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
  },
};
