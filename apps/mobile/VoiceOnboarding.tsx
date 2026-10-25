import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { NETWORK_AREAS } from "../../packages/core/network";
import type { OnboardingProfile } from "../../packages/core/onboarding";
import { friendlyError } from "./friendlyError";
import { FormationVisual } from "./FormationVisual";

export function VoiceOnboarding({
  connected,
  hasProfile = false,
  onManual,
}: {
  connected: boolean;
  hasProfile?: boolean;
  onManual?: () => void;
}) {
  const { width } = useWindowDimensions();
  const data = useQuery(api.onboarding.mine, {}),
    begin = useMutation(api.onboarding.begin),
    approve = useMutation(api.onboarding.approve),
    retry = useMutation(api.onboarding.retryStatus),
    discard = useMutation(api.onboarding.discard),
    demo = useMutation(api.demo.useHarsh),
    done = useMutation(api.onboarding.done);
  const [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<OnboardingProfile | null>(null),
    [expanded, setExpanded] = useState(!hasProfile);
  useEffect(() => {
    setDraft(data?.call?.draft ?? null);
  }, [data?.call?.id, data?.call?.status]);
  const call = data?.call,
    active =
      call &&
      ["starting", "calling", "processing", "uncertain"].includes(call.status);
  async function run(task: () => Promise<unknown>) {
    if (busy || !connected) return;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(friendlyError(e, "Couldn’t update onboarding. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <LinearGradient
      colors={["#141b24", "#111820"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded(!expanded)}
        style={s.row}
      >
        <View style={s.icon}>
          <Ionicons name="radio-outline" size={24} color="#b9ead9" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>ONE CONVERSATION. YOUR WHOLE WORLD.</Text>
          <Text style={s.title}>
            {hasProfile ? "Your voice, your context." : "Let’s start with you."}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#a6a1b8"
        />
      </Pressable>
      {expanded && (
        <>
          {!active && (
            <Text style={s.copy}>
              A short call about what you’re building and who you want to meet.
            </Text>
          )}
          {call?.status === "review" && draft ? (
            <>
              <Text style={s.label}>HERE’S WHAT WE HEARD</Text>
              <TextInput
                accessibilityLabel="Voice profile name"
                style={s.input}
                value={draft.name}
                maxLength={60}
                onChangeText={(name) => setDraft({ ...draft, name })}
              />
              <TextInput
                accessibilityLabel="Voice profile headline"
                style={s.input}
                value={draft.headline}
                maxLength={120}
                onChangeText={(headline) => setDraft({ ...draft, headline })}
              />
              <TextInput
                accessibilityLabel="Voice profile goal"
                style={[s.input, { minHeight: 75 }]}
                multiline
                value={draft.goal}
                maxLength={500}
                onChangeText={(goal) => setDraft({ ...draft, goal })}
              />
              <TextInput
                accessibilityLabel="Voice profile context"
                style={[s.input, { minHeight: 100 }]}
                multiline
                value={draft.context}
                maxLength={1600}
                onChangeText={(context) => setDraft({ ...draft, context })}
              />
              <View style={s.tags}>
                {draft.networkAreas.map((id) => (
                  <Text key={id} style={s.tag}>
                    {NETWORK_AREAS.find((a) => a.id === id)?.label}
                  </Text>
                ))}
              </View>
              <Text style={s.fine}>
                Your context stays private. Your name and headline are visible
                only to accepted connections. No social accounts are linked.
              </Text>
              <CTA
                label="Use this context everywhere"
                disabled={busy || !connected || !draft.name.trim()}
                onPress={() => void run(() => approve({ id: call.id, draft }))}
              />
              <CTA
                label="Discard this draft"
                quiet
                onPress={() => void run(() => discard({ id: call.id }))}
              />
            </>
          ) : active ? (
            <View style={s.status}>
              <FormationVisual
                size={Math.min(width - 100, 270)}
                phase={
                  call.status === "processing"
                    ? "processing"
                    : call.building
                      ? "connecting"
                      : "calling"
                }
              />
              <Text style={s.title}>
                {call.status === "processing"
                  ? "Finding your threads."
                  : call.building
                    ? "Your world is taking shape."
                    : call.status === "uncertain"
                      ? "Checking your call…"
                      : "Let’s hear your story."}
              </Text>
              <Text style={[s.copy, { textAlign: "center" }]}>
                {!connected
                  ? "Your call can continue. We’ll reconnect when you’re online."
                  : call.status === "processing"
                    ? "Finding the people, ideas and possibilities in what you shared."
                    : call.building
                      ? "Your conversation is becoming context. Give it a moment."
                      : "Answer the call. Be yourself. Tap Done when you’ve finished."}
              </Text>
              <CTA
                label={
                  call.building
                    ? "Building your world…"
                    : "Done — build my world"
                }
                disabled={busy || !connected || call.building}
                onPress={() => void run(() => done({ id: call.id }))}
              />
              {call.status === "uncertain" && (
                <CTA
                  label="Check call status"
                  quiet
                  disabled={busy || !connected}
                  onPress={() => void run(() => retry({ id: call.id }))}
                />
              )}
            </View>
          ) : (
            <>
              {call?.status === "approved" && (
                <Text style={s.tag}>Voice context saved across your app</Text>
              )}
              {call?.status === "error" && (
                <>
                  <Text style={s.fine}>{call.error}</Text>
                  <CTA
                    label="Check the same call again"
                    quiet
                    onPress={() => void run(() => retry({ id: call.id }))}
                  />
                </>
              )}
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Your phone number · +1…"
                placeholderTextColor="#777c91"
                accessibilityLabel="Onboarding phone number"
                autoComplete="tel"
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Consent to my onboarding call"
                accessibilityState={{ checked: consent }}
                aria-checked={consent}
                onPress={() => setConsent(!consent)}
                style={s.row}
              >
                <Ionicons
                  name={consent ? "checkbox" : "square-outline"}
                  size={22}
                  color="#b9a9ec"
                />
                <Text style={[s.fine, { flex: 1 }]}>
                  This is my number. I agree to an AI call and private
                  transcript processing by Bland and OpenAI to prepare my
                  profile.
                </Text>
              </Pressable>
              <CTA
                label={
                  data?.configured ? "Call me" : "Voice call · awaiting setup"
                }
                disabled={
                  !data?.configured || !consent || !phone || busy || !connected
                }
                onPress={() => void run(() => begin({ phone, consent }))}
              />
              {!hasProfile && (
                <CTA
                  label="Try Harsh’s coCreatr demo"
                  quiet
                  disabled={busy || !connected}
                  onPress={() => void run(() => demo({}))}
                />
              )}
              {onManual && (
                <CTA label="Edit manually instead" quiet onPress={onManual} />
              )}
              <Text style={s.fine}>
                2 calls per day. Demo mode is a labeled persona, not a verified
                identity.
              </Text>
            </>
          )}
        </>
      )}
      {busy && <ActivityIndicator color="#b9a9ec" style={{ marginTop: 12 }} />}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </LinearGradient>
  );
}
function CTA({
  label,
  onPress,
  disabled = false,
  quiet = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quiet,
        { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[s.buttonText, quiet && { color: "#b8b5cb" }]}>{label}</Text>
      {!quiet && <Ionicons name="arrow-forward" size={18} color="#151722" />}
    </Pressable>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#ffffff12",
    marginVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#b4e5d815",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 8, letterSpacing: 1.3, color: "#a5b9be" },
  title: {
    fontSize: 22,
    letterSpacing: -0.7,
    color: "#f1eff9",
    fontWeight: "500",
    marginTop: 5,
  },
  copy: { color: "#a3a6ba", fontSize: 13, lineHeight: 21, marginVertical: 15 },
  fine: { fontSize: 10, color: "#9999ad", lineHeight: 17 },
  label: { fontSize: 9, letterSpacing: 1.5, color: "#bea9ef", marginTop: 10 },
  input: {
    backgroundColor: "#080d1677",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ffffff10",
    padding: 14,
    color: "#ece9f6",
    fontSize: 14,
    marginVertical: 7,
  },
  button: {
    padding: 15,
    borderRadius: 22,
    backgroundColor: "#bdafeb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  quiet: {
    backgroundColor: "transparent",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  buttonText: { fontSize: 13, fontWeight: "500", color: "#151722" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 10 },
  tag: {
    fontSize: 10,
    color: "#b9ead9",
    backgroundColor: "#b9ead912",
    borderRadius: 14,
    padding: 8,
  },
  status: { alignItems: "center", paddingVertical: 25 },
  error: { fontSize: 12, color: "#efb5c0", lineHeight: 19, marginTop: 10 },
});
