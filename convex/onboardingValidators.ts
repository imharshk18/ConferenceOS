import { v } from 'convex/values';
export const onboardingProfile = v.object({name:v.string(),headline:v.string(),goal:v.string(),context:v.string(),skillIds:v.array(v.string()),networkAreas:v.array(v.string())});
export const onboardingStatus = v.union(...(['starting','calling','processing','review','approved','error','uncertain','discarded'] as const).map(v.literal));
