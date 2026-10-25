import { mediaType } from './capture';
/** Native file fetches often report audio/x-m4a, video/mp4 or application/octet-stream.
 * The recorder's known container, not an OS MIME guess, controls its upload header. */
export function uploadMime(kind: 'audio' | 'photo', recordedMime: string, blobMime: string) {
  const intended = recordedMime.toLowerCase().split(';')[0].trim();
  const detected = blobMime.toLowerCase().split(';')[0].trim();
  const candidate = kind === 'audio' ? intended : detected && detected !== 'application/octet-stream' ? detected : intended;
  const canonical = ['audio/m4a','audio/x-m4a','video/mp4'].includes(candidate) ? 'audio/mp4' : candidate;
  const media = mediaType(canonical);
  if (media.kind !== (kind === 'audio' ? 'audio' : 'image')) throw new Error('The attachment format does not match its type.');
  return canonical;
}
