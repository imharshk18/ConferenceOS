import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path } from "react-native-svg";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { NETWORK_AREAS } from "../../packages/core/network";
import { useReducedMotion } from "./useReducedMotion";

type Peer = { id: string; name: string; headline: string; areas: string[] };
// Intentionally fictional, local-only cast. Never persisted as connections.
export const WRAPPED_DEMO_PEERS: Peer[] = [
  {
    id: "d1",
    name: "Mira Vale",
    headline: "Creator platform founder",
    areas: ["content", "product", "founders"],
  },
  {
    id: "d2",
    name: "Theo North",
    headline: "Independent filmmaker",
    areas: ["content", "design"],
  },
  {
    id: "d3",
    name: "Inez Brook",
    headline: "Newsletter builder",
    areas: ["content", "growth"],
  },
  {
    id: "d4",
    name: "Remy Sol",
    headline: "Creative technologist",
    areas: ["content", "ai"],
  },
  {
    id: "d5",
    name: "Jules Fern",
    headline: "Community storyteller",
    areas: ["content", "growth"],
  },
  {
    id: "d6",
    name: "Sage Meridian",
    headline: "Consumer app founder",
    areas: ["product", "founders"],
  },
  {
    id: "d7",
    name: "Nico Wren",
    headline: "Product designer",
    areas: ["product", "design"],
  },
  {
    id: "d8",
    name: "Lena Cove",
    headline: "AI product founder",
    areas: ["ai", "product", "founders"],
  },
  {
    id: "d9",
    name: "Arlo Finch",
    headline: "Research engineer",
    areas: ["ai", "research"],
  },
  {
    id: "d10",
    name: "Esme Reed",
    headline: "Studio founder",
    areas: ["founders", "design"],
  },
  {
    id: "d11",
    name: "Oren Lake",
    headline: "Developer community lead",
    areas: ["growth", "devex"],
  },
  {
    id: "d12",
    name: "Tess Arbor",
    headline: "Open-source maintainer",
    areas: ["opensource", "devex"],
  },
];
export function wrappedPeopleCounts(peers: Peer[]) {
  return NETWORK_AREAS.map((area) => ({
    ...area,
    count: new Set(
      peers
        .filter((peer) => peer.areas.includes(area.id))
        .map((peer) => peer.id),
    ).size,
  }))
    .filter((area) => area.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
const DEMO_SESSIONS = [
  "Stories that bring people together",
  "Building a creator-first product",
  "A small team, a big idea",
  "AI as a creative collaborator",
  "The art of useful communities",
  "Designing for a second visit",
  "Open source, open possibilities",
  "From a first hello to a partnership",
];
const PALETTES = [
  ["#bce9d3", "#7ec7ba"],
  ["#f1bd8c", "#e9937e"],
  ["#202a55", "#101c37"],
  ["#edeaa1", "#c9dd91"],
  ["#bcaddf", "#8da7d0"],
] as const;

function RevealBlock({
  children,
  delay = 0,
  reduced,
}: {
  children: React.ReactNode;
  delay?: number;
  reduced: boolean;
}) {
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 1000,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [value, reduced, delay]);
  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function WrappedLauncher({
  authenticated,
  connected,
  onNetwork,
}: {
  authenticated: boolean;
  connected: boolean;
  onNetwork?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [actual, setActual] = useState(false),
    [chapter, setChapter] = useState(0),
    [paused, setPaused] = useState(false),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  const reduced = useReducedMotion(),
    insets = useSafeAreaInsets();
  const network = useQuery(
    api.network.mine,
    open && actual && authenticated ? {} : "skip",
  );
  const social = useQuery(
    api.social.mine,
    open && actual && authenticated ? {} : "skip",
  );
  const captures = useQuery(
    api.captures.mine,
    open && actual && authenticated ? {} : "skip",
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (reduced) setPaused(true);
  }, [reduced]);
  const loading =
    actual &&
    authenticated &&
    (network === undefined || social === undefined || captures === undefined);
  useEffect(() => {
    if (!open || paused || !foreground || loading || chapter === 4) return;
    const timer = setTimeout(
      () => setChapter((value) => Math.min(4, value + 1)),
      8500,
    );
    return () => clearTimeout(timer);
  }, [open, paused, foreground, loading, chapter, actual]);
  const peers: Peer[] = actual
    ? (social?.connections || [])
        .filter((person) => person.status === "accepted" && !person.demo)
        .map((person) => ({
          id: person.id,
          name: person.name,
          headline: person.headline,
          areas:
            network?.status === "ready"
              ? network.graph.nodes.find(
                  (node) => node.id === `person:${person.id}`,
                )?.areaIds || []
              : [],
        }))
    : WRAPPED_DEMO_PEERS;
  const areas = wrappedPeopleCounts(peers);
  const sessions = actual
    ? [
        ...new Map(
          (captures || [])
            .filter(
              (capture) =>
                capture.kind === "session" &&
                capture.status === "approved" &&
                capture.attended,
            )
            .map(
              (capture) =>
                [capture.talkId || capture.id, capture.title] as const,
            ),
        ).values(),
      ]
    : DEMO_SESSIONS;
  const dark = chapter === 2,
    ink = dark ? "#edf1fa" : "#18282e",
    muted = dark ? "#a8b8d3" : "#435f62";
  const changeChapter = (next: number) => {
    setPaused(true);
    setChapter(Math.max(0, Math.min(4, next)));
  };
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open my Network Wrapped"
        onPress={() => {
          setActual(false);
          setChapter(0);
          setPaused(reduced);
          setOpen(true);
        }}
        style={s.launcher}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.launchKicker}>THE CONFERENCE, REMIXED</Text>
          <Text style={s.launchTitle}>You had to be there.</Text>
          <Text style={s.launchCopy}>
            Your people. Your ideas. Your Wrapped.
          </Text>
        </View>
        <View style={s.launchArrow}>
          <Ionicons
            name="arrow-up-right-box-outline"
            size={29}
            color="#bce9d3"
          />
        </View>
      </Pressable>
      {open && (
        <Modal
          animationType={reduced ? "none" : "fade"}
          onRequestClose={() => setOpen(false)}
        >
          <LinearGradient
            colors={[...PALETTES[chapter]]}
            style={[
              s.page,
              {
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 13,
              },
            ]}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 390 844"
                preserveAspectRatio="xMidYMid slice"
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <Circle
                    key={i}
                    cx={chapter % 2 ? 20 : 360}
                    cy={chapter % 2 ? 680 : 245}
                    r={70 + i * 45}
                    stroke={ink}
                    strokeWidth={0.8}
                    opacity={0.08}
                    fill="none"
                  />
                ))}
                <Path
                  d="M-40 610 Q140 450 420 735"
                  stroke={ink}
                  opacity=".08"
                  strokeWidth="60"
                  fill="none"
                />
              </Svg>
            </View>
            <View style={s.steps}>
              {[0, 1, 2, 3, 4].map((index) => (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={`Wrapped story ${index + 1} of 5`}
                  onPress={() => changeChapter(index)}
                  style={{ flex: 1, height: 16, justifyContent: "center" }}
                >
                  <View
                    style={{
                      height: 3,
                      borderRadius: 3,
                      backgroundColor: ink,
                      opacity: index <= chapter ? 0.8 : 0.15,
                    }}
                  />
                </Pressable>
              ))}
            </View>
            <View style={s.top}>
              <Text style={[s.brand, { color: ink }]}>
                conferenceos / wrapped
              </Text>
              <Text style={[s.mode, { color: ink, borderColor: ink + "40" }]}>
                {actual ? "ACTUAL ACTIVITY" : "DEMO · FICTIONAL"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Network Wrapped"
                onPress={() => setOpen(false)}
                style={s.iconButton}
              >
                <Ionicons name="close" size={23} color={ink} />
              </Pressable>
            </View>
            <View style={s.top}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  actual ? "Show demo Wrapped" : "My actual activity"
                }
                onPress={() => {
                  setActual(!actual);
                  setChapter(0);
                  setPaused(true);
                }}
              >
                <Text style={[s.modeLink, { color: muted }]}>
                  {actual ? "Switch to demo ↗" : "My actual activity ↗"}
                </Text>
              </Pressable>
              <Text style={[s.modeLink, { color: muted }]}>
                {actual
                  ? connected
                    ? "Private saved activity"
                    : "Offline · saved activity"
                  : "A fictional conference story"}
              </Text>
            </View>
            {loading ? (
              <View style={s.loading}>
                <ActivityIndicator color={ink} />
                <Text style={[s.body, { color: ink }]}>
                  Opening your saved activity…
                </Text>
              </View>
            ) : actual && !authenticated ? (
              <View style={s.loading}>
                <Text style={[s.heading, { color: ink }]}>
                  Your story starts with you.
                </Text>
                <Text style={[s.body, { color: muted }]}>
                  Create a profile to see your saved activity. No numbers have
                  been filled in.
                </Text>
                {onNetwork && (
                  <Pressable
                    onPress={() => {
                      setOpen(false);
                      onNetwork();
                    }}
                  >
                    <Text style={[s.modeLink, { color: ink }]}>
                      Open Network →
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <ScrollView
                key={`${actual}-${chapter}`}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.story}
                onScrollBeginDrag={() => setPaused(true)}
                testID={`conference-wrapped-story-${chapter + 1}`}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pause Wrapped story"
                  onPress={() => setPaused(true)}
                >
                  <RevealBlock reduced={reduced || !foreground}>
                    <Text style={[s.kicker, { color: muted }]}>
                      {
                        [
                          "A LITTLE CURIOSITY GOES A LONG WAY",
                          "YOU MADE ROOM FOR NEW IDEAS",
                          "THE BEST PART WAS THE PEOPLE",
                          "YOUR WORLD GOT A LITTLE WIDER",
                          "KEEP THE GOOD PEOPLE CLOSE",
                        ][chapter]
                      }
                    </Text>
                  </RevealBlock>
                  <RevealBlock reduced={reduced || !foreground} delay={300}>
                    <Text style={[s.heading, { color: ink }]}>
                      {
                        [
                          actual
                            ? "Here’s what\nyou kept."
                            : "What a\nchapter.",
                          `${sessions.length} sessions.\nFresh perspectives.`,
                          `${peers.length} new\nconnections.`,
                          "Different worlds.\nCommon ground.",
                          actual
                            ? "Your people,\nin one place."
                            : "12 hellos.\nEndless possibility.",
                        ][chapter]
                      }
                    </Text>
                  </RevealBlock>
                  {chapter === 0 && (
                    <RevealBlock reduced={reduced || !foreground} delay={850}>
                      <View style={s.bigPair}>
                        <View>
                          <Text style={[s.bigNumber, { color: ink }]}>
                            {sessions.length}
                          </Text>
                          <Text style={[s.statLabel, { color: muted }]}>
                            sessions
                          </Text>
                        </View>
                        <View>
                          <Text style={[s.bigNumber, { color: ink }]}>
                            {peers.length}
                          </Text>
                          <Text style={[s.statLabel, { color: muted }]}>
                            connections
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.body, { color: muted }]}>
                        {actual
                          ? "Approved, self-reported attendance and accepted, non-demo connections."
                          : "You followed your curiosity. You found your people. Here’s one imagined version of a very good conference."}
                      </Text>
                    </RevealBlock>
                  )}
                  {chapter === 1 && (
                    <View style={{ marginTop: 22 }}>
                      {sessions.length ? (
                        sessions.map((title, index) => (
                          <RevealBlock
                            key={`${index}-${title}`}
                            reduced={reduced || !foreground}
                            delay={650 + index * 110}
                          >
                            <View
                              style={[s.session, { borderColor: ink + "20" }]}
                            >
                              <Text style={[s.sessionIndex, { color: muted }]}>
                                {String(index + 1).padStart(2, "0")}
                              </Text>
                              <Text style={[s.sessionTitle, { color: ink }]}>
                                {title}
                              </Text>
                            </View>
                          </RevealBlock>
                        ))
                      ) : (
                        <Text style={[s.body, { color: muted }]}>
                          No approved session captures marked attended yet.
                          Learning notes alone don’t count as attendance.
                        </Text>
                      )}
                      <Text style={[s.note, { color: muted }]}>
                        {actual
                          ? "Attendance is self-reported in approved captures."
                          : "Imagined session titles for this demo; not an event schedule."}
                      </Text>
                    </View>
                  )}
                  {chapter === 2 && (
                    <View style={{ marginTop: 24 }}>
                      {peers.slice(0, 5).map((person, index) => (
                        <RevealBlock
                          key={person.id}
                          reduced={reduced || !foreground}
                          delay={650 + index * 190}
                        >
                          <View style={s.personRow}>
                            <View
                              style={[
                                s.avatar,
                                {
                                  backgroundColor: [
                                    "#d1edc3",
                                    "#f0c1a6",
                                    "#c4c2e8",
                                  ][index % 3],
                                },
                              ]}
                            >
                              <Text style={s.initials}>
                                {initials(person.name)}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.personName, { color: ink }]}>
                                {person.name}
                              </Text>
                              <Text style={[s.personRole, { color: muted }]}>
                                {person.headline}
                              </Text>
                            </View>
                          </View>
                        </RevealBlock>
                      ))}
                      <Text style={[s.body, { color: muted }]}>
                        {peers.length > 5
                          ? `And ${peers.length - 5} more reasons to keep the conversation going.`
                          : peers.length
                            ? "A good beginning. A reason to say hello again."
                            : "Your first accepted connection will appear here."}
                      </Text>
                    </View>
                  )}
                  {chapter === 3 && (
                    <View style={{ marginTop: 25 }}>
                      {actual && network?.status !== "ready" ? (
                        <Text style={[s.body, { color: muted }]}>
                          Your context map isn’t ready yet. Area counts aren’t
                          estimated.
                        </Text>
                      ) : areas.length ? (
                        areas.slice(0, 6).map((area, index) => (
                          <RevealBlock
                            key={area.id}
                            reduced={reduced || !foreground}
                            delay={650 + index * 160}
                          >
                            <View style={s.area}>
                              <View style={s.areaTop}>
                                <Text style={[s.areaName, { color: ink }]}>
                                  {area.label}
                                </Text>
                                <Text style={[s.areaCount, { color: ink }]}>
                                  {area.count}
                                </Text>
                              </View>
                              <View
                                style={{
                                  height: 5,
                                  backgroundColor: ink + "12",
                                  borderRadius: 3,
                                }}
                              >
                                <View
                                  style={{
                                    height: 5,
                                    width: `${(100 * area.count) / Math.max(1, peers.length)}%`,
                                    backgroundColor: ink,
                                    borderRadius: 3,
                                  }}
                                />
                              </View>
                            </View>
                          </RevealBlock>
                        ))
                      ) : (
                        <Text style={[s.body, { color: muted }]}>
                          No connection areas yet. Nothing has been inferred to
                          fill the space.
                        </Text>
                      )}
                      <Text style={[s.note, { color: muted }]}>
                        Distinct people per area. One person can appear in
                        several areas. Context, not a skill rating.
                      </Text>
                    </View>
                  )}
                  {chapter === 4 && (
                    <RevealBlock reduced={reduced || !foreground} delay={650}>
                      <View style={s.grid}>
                        {peers.map((person, index) => (
                          <View key={person.id} style={s.gridPerson}>
                            <View
                              style={[
                                s.avatar,
                                {
                                  width: 54,
                                  height: 54,
                                  borderRadius: 27,
                                  backgroundColor: [
                                    "#d8eed1",
                                    "#f4c4af",
                                    "#c7d4eb",
                                  ][index % 3],
                                },
                              ]}
                            >
                              <Text style={s.initials}>
                                {initials(person.name)}
                              </Text>
                            </View>
                            <Text
                              numberOfLines={2}
                              style={[s.gridName, { color: ink }]}
                            >
                              {person.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <Text style={[s.body, { color: muted }]}>
                        {actual
                          ? "No automatic messages. Your next hello is yours to make."
                          : "The conference ends. The conversations don’t have to."}
                      </Text>
                    </RevealBlock>
                  )}
                </Pressable>
              </ScrollView>
            )}
            <View style={s.controls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous Wrapped story"
                disabled={chapter === 0}
                onPress={() => changeChapter(chapter - 1)}
                style={s.iconButton}
              >
                <Ionicons
                  name="arrow-back"
                  size={23}
                  color={ink}
                  style={{ opacity: chapter === 0 ? 0.25 : 1 }}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  paused ? "Play Wrapped stories" : "Pause Wrapped stories"
                }
                onPress={() => setPaused(!paused)}
                style={s.play}
              >
                <Ionicons
                  name={paused ? "play" : "pause"}
                  size={15}
                  color={ink}
                />
                <Text style={[s.controlText, { color: ink }]}>
                  {chapter === 4
                    ? "Final chapter"
                    : paused
                      ? "Play stories"
                      : "Take it in"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  chapter === 4 ? "Finish Wrapped" : "Next Wrapped story"
                }
                onPress={() =>
                  chapter === 4 ? setOpen(false) : changeChapter(chapter + 1)
                }
                style={s.iconButton}
              >
                <Ionicons
                  name={chapter === 4 ? "checkmark" : "arrow-forward"}
                  size={23}
                  color={ink}
                />
              </Pressable>
            </View>
          </LinearGradient>
        </Modal>
      )}
    </>
  );
}
const s = StyleSheet.create({
  launcher: {
    paddingVertical: 23,
    borderTopWidth: 1,
    borderColor: "#ffffff15",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 15,
  },
  launchKicker: { fontSize: 9, letterSpacing: 1.8, color: "#b0c7be" },
  launchTitle: {
    fontSize: 26,
    fontWeight: "400",
    letterSpacing: -1,
    color: "#e3ece5",
    marginTop: 10,
  },
  launchCopy: { fontSize: 12, color: "#929da9", marginTop: 7 },
  launchArrow: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#bce9d311",
  },
  page: { flex: 1, paddingHorizontal: 23 },
  steps: { flexDirection: "row", gap: 5 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
  brand: { fontSize: 10, fontWeight: "600", letterSpacing: -0.2 },
  mode: {
    fontSize: 8,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  iconButton: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  modeLink: { fontSize: 10, paddingVertical: 6 },
  story: { paddingTop: 35, paddingBottom: 25 },
  kicker: { fontSize: 9, letterSpacing: 1.5, lineHeight: 15 },
  heading: {
    fontSize: 45,
    lineHeight: 48,
    letterSpacing: -2.2,
    fontWeight: "500",
    marginTop: 19,
  },
  bigPair: { flexDirection: "row", gap: 38, marginVertical: 32 },
  bigNumber: {
    fontSize: 95,
    lineHeight: 106,
    fontWeight: "300",
    letterSpacing: -6,
  },
  statLabel: { fontSize: 14 },
  body: { fontSize: 16, lineHeight: 25, marginTop: 20 },
  session: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sessionIndex: { fontSize: 10 },
  sessionTitle: { flex: 1, fontSize: 15, lineHeight: 21 },
  note: { fontSize: 10, lineHeight: 17, marginTop: 20 },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginBottom: 19,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 15, fontWeight: "500", color: "#22343d" },
  personName: { fontSize: 18, letterSpacing: -0.4 },
  personRole: { fontSize: 11, marginTop: 4 },
  area: { marginBottom: 22 },
  areaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  areaName: { fontSize: 15 },
  areaCount: { fontSize: 23, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 30, gap: 10 },
  gridPerson: { width: "30%", alignItems: "center", marginBottom: 11 },
  gridName: { fontSize: 11, textAlign: "center", lineHeight: 15, marginTop: 7 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  play: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  controlText: { fontSize: 11 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
