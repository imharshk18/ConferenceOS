import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useReducedMotion } from "./useReducedMotion";

/** An animated recording indicator, not a measured microphone waveform. */
export function RecorderVisual({
  recording,
  elapsed,
  recorded,
}: {
  recording: boolean;
  elapsed: number;
  recorded: boolean;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === "active");
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!recording || reduced || !active) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1150,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1150,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [recording, reduced, active, pulse]);
  const seconds = Math.min(90, Math.floor(elapsed / 1000));
  return (
    <LinearGradient testID="conversation-recorder" colors={["#282338", "#141820"]} style={s.stage}>
      <Animated.View
        testID="recorder-pulse"
        style={[
          s.halo,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 0.55],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.18],
                }),
              },
            ],
          },
        ]}
      />
      <View style={s.mic}>
        <Ionicons
          name={recorded && !recording ? "checkmark-outline" : "mic-outline"}
          size={30}
          color="#d7f9ea"
        />
      </View>
      <View
        accessibilityLabel="Animated recording indicator, not audio amplitude"
        style={s.wave}
      >
        {Array.from({ length: 23 }, (_, index) => (
          <Animated.View
            key={index}
            style={{
              width: 3,
              borderRadius: 4,
              height: 12 + Math.sin(index * 1.71) ** 2 * 28,
              backgroundColor: recording ? "#b4f1d8" : "#746b89",
              opacity: recording ? 0.85 : 0.4,
              transform: [
                {
                  scaleY: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: index % 2 ? [0.5, 1] : [1, 0.45],
                  }),
                },
              ],
            }}
          />
        ))}
      </View>
      <Text
        style={s.time}
      >{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</Text>
      <Text style={s.label}>
        {recording
          ? "Listening to this moment"
          : recorded
            ? "A moment worth keeping"
            : "Be here. We’ll keep the details."}
      </Text>
      <Text style={s.fine}>
        {recording
          ? "Animated indicator · stops at 90 seconds"
          : "Private until you review and approve"}
      </Text>
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  stage: {
    borderRadius: 30,
    alignItems: "center",
    padding: 24,
    marginBottom: 15,
    overflow: "hidden",
  },
  halo: {
    position: "absolute",
    top: 9,
    width: 132,
    height: 132,
    borderRadius: 70,
    backgroundColor: "#8bd6bf",
  },
  mic: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#213b39",
    marginTop: 16,
  },
  wave: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    height: 48,
    marginTop: 23,
  },
  time: {
    fontSize: 35,
    fontWeight: "300",
    fontVariant: ["tabular-nums"],
    color: "#f1eafa",
    marginTop: 8,
  },
  label: { fontSize: 16, color: "#eee7f7", marginTop: 10, fontWeight: "400" },
  fine: { fontSize: 10, color: "#a59cae", marginTop: 8 },
});
