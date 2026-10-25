import { createURL } from "expo-linking";
import { Platform } from "react-native";
import { invitationPayload, parseInvitationPayload } from "./inviteCode";
// Expo Go produces exp://HOST/--/connect; installed builds use the app scheme.
// Web keeps the root path so static preview hosts do not need a /connect route.
const base = () => Platform.OS === "web" ? `${createURL("").replace(/\/$/, "")}/` : createURL("connect");
export const shareInvitationUrl = (code: string) => invitationPayload(code, base());
export const readIncomingInvite = (value: string) => parseInvitationPayload(value, base());
