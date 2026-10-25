/** Public official program. Refresh with `node scripts/scrape-universe.mjs`. */
import snapshot from '../../data/universe-source.json';

export const officialProgramSource = {
  ...snapshot.provenance,
  eventUrl: snapshot.event.sourceUrl,
  timeZone: snapshot.event.timeZone,
};

export const officialEvent = {
  name: snapshot.event.name,
  date: 'October 28–29, 2026',
  venue: snapshot.event.venue,
  demo: false,
  sourceUrl: snapshot.event.sourceUrl,
  fetchedAt: snapshot.provenance.fetchedAt,
};

const speakerColors = ['#d7eac9', '#c9dce9', '#e8d5c5', '#dbcce9', '#cfe7d7', '#e9d9b9'];
const talkColors = ['#dfecc9', '#e8ddfa', '#f7dfcc', '#d7e8f3', '#f5d9dd', '#f1e6c5'];

export const officialSpeakers = snapshot.speakers.map((speaker, index) => ({
  ...speaker,
  initials: speaker.name.split(/\s+/).filter(Boolean).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(),
  color: speakerColors[index % speakerColors.length],
  demo: false,
}));

const mainSessions = snapshot.sessions.filter((session) => snapshot.event.dates.includes(session.date));

export const officialRooms = [...new Map(mainSessions.filter((s) => s.roomId).map((s) => [s.roomId, {
  id: s.roomId, name: s.room, sourceUrl: s.sourceUrl, demo: false,
}])).values()];

/** Group only official Topic attributes; titles never create recommendation edges. */
export function topicIdsFromOfficialTopics(values: string[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    const topic = value.toLowerCase().trim();
    if (topic.startsWith('ai:')) ids.push('ai');
    if (topic === 'open source') ids.push('opensource');
    if (topic === 'platform engineering') ids.push('platform');
    if (topic.startsWith('security (') || topic === 'governance and compliance' || topic === 'devops and devsecops') ids.push('security');
    if (['developer experience (dx)', 'productivity', 'code quality, review, and completion', 'accessibility', 'collaboration', 'testing and related practices'].includes(topic)) ids.push('devex');
    if (topic === 'knowledge graphs') ids.push('graph');
  }
  return [...new Set(ids)];
}

export const officialTalks = mainSessions.map((session, index) => {
  const officialTopics = session.attributes.filter((a) => a.name === 'Topic').map((a) => a.value);
  const track = session.attributes.find((a) => a.name === 'SessionTrackNotMulti')?.value
    || session.attributes.find((a) => a.name === 'Track')?.value || '';
  return {
    ...session,
    subtitle: session.description,
    speakerId: session.speakerIds[0] || '',
    topicIds: topicIdsFromOfficialTopics(officialTopics),
    officialTopics,
    day: session.date === '2026-10-28' ? 1 : 2,
    duration: session.duration ?? 0,
    track,
    color: talkColors[index % talkColors.length],
    featured: session.format === 'Keynote',
    confirmed: true,
    demo: false,
  };
});
