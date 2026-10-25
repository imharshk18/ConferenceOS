import sourceData from '../../data/profile-sources.json';

/** Public professional evidence, separate from synthetic conference demo edges. */
export type ProfileEvidence = {
  url: string;
  kind: 'public-profile' | 'self-authored-post' | 'self-authored-professional-site' | 'company-careers-page';
  access: 'search-index' | 'direct-public';
  crawlRecency: string;
  summary: string;
};

export type PublicProfileSource = {
  id: string;
  name: string;
  profileUrl: string;
  role: string;
  company: string;
  affiliationType: 'employment' | 'education';
  city: string;
  region: string;
  country: string;
  /** Explicitly discussed public professional subjects, not event preferences. */
  professionalTopics: string[];
  demo: true;
  attendanceConfirmed: false;
  sourceStatus: 'public-indexed' | 'public-indexed-and-first-party';
  directProfileAccess: 'blocked';
  roleVerification: 'public-self-report';
  hiring: {
    status: 'not-verified' | 'public-post-found';
    currentOpeningsVerified: false;
    sourceUrl: string | null;
    careersUrl?: string;
    note: string;
  };
  sources: ProfileEvidence[];
};

export type PublicProfileDataset = {
  schemaVersion: number;
  fetchedAt: string;
  purpose: string;
  disclosure: string;
  collectionMethod: string;
  excludedData: string[];
  profiles: PublicProfileSource[];
};

export const publicProfileDataset = sourceData as PublicProfileDataset;
export const profileSources = publicProfileDataset.profiles;
export const profileSourcesById = Object.fromEntries(
  profileSources.map(profile => [profile.id, profile]),
) as Record<string, PublicProfileSource>;
export const profileSourceDisclosure = publicProfileDataset.disclosure;
export const profileSourcesFetchedAt = publicProfileDataset.fetchedAt;
