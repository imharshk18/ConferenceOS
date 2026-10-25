import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VoiceOnboarding } from "./VoiceOnboarding";
import { NetworkOrbit } from "./NetworkExperience";
import { useReducedMotion } from "./useReducedMotion";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
export function WelcomeFlow({
  connected,
  profileReady,
  onClose,
}: {
  connected: boolean;
  profileReady: boolean;
  onClose: (personal: boolean) => void;
}) {
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    reduced = useReducedMotion();
  const onboarding = useQuery(api.onboarding.mine, {}),
    active =
      onboarding?.call &&
      ["starting", "calling", "processing", "uncertain"].includes(
        onboarding.call.status,
      );
  return (
    <Modal
      animationType={reduced ? "none" : "fade"}
      onRequestClose={() => onClose(false)}
    >
      <LinearGradient
        colors={["#080b12", "#161526", "#0b151c"]}
        style={[
          s.page,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 18 },
        ]}
      >
        <Text style={s.brand}>
          conference<Text style={{ fontWeight: "300" }}>os</Text>
        </Text>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {!active && (
            <>
              <Text style={s.kicker}>
                {profileReady
                  ? "YOUR CONTEXT IS CONNECTED"
                  : "BEFORE THE FIRST HELLO"}
              </Text>
              <Text style={s.title}>
                {profileReady
                  ? "Your world,\ntaking shape."
                  : "Your next chapter\nstarts with you."}
              </Text>
              <Text style={s.copy}>
                {profileReady
                  ? "Your interests are the beginning. Every good conversation adds another thread."
                  : "A little about you. A conference full of possibilities."}
              </Text>
            </>
          )}
          {profileReady ? (
            <NetworkOrbit
              authenticated
              connected={connected}
              width={Math.min(width - 24, 470)}
              onPerson={() => onClose(true)}
            />
          ) : (
            <VoiceOnboarding connected={connected} />
          )}
        </ScrollView>
        {!active && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              profileReady ? "Enter my world" : "Explore first"
            }
            style={s.enter}
            onPress={() => onClose(profileReady)}
          >
            <Text style={s.enterText}>
              {profileReady ? "Enter my world →" : "Explore first →"}
            </Text>
          </Pressable>
        )}
      </LinearGradient>
    </Modal>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 22 },
  brand: {
    color: "#eae6f6",
    fontSize: 23,
    letterSpacing: -1,
    fontWeight: "600",
    marginBottom: 18,
  },
  kicker: { color: "#a9cfca", letterSpacing: 2, fontSize: 9, marginTop: 25 },
  title: {
    color: "#efedf8",
    fontSize: 33,
    lineHeight: 39,
    letterSpacing: -1.3,
    fontWeight: "400",
    marginTop: 16,
  },
  copy: {
    fontSize: 13,
    lineHeight: 21,
    color: "#979eaf",
    marginTop: 15,
    marginBottom: 15,
  },
  enter: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#c8b7f0",
    alignItems: "center",
  },
  enterText: { color: "#171521", fontSize: 14, fontWeight: "500" },
});
