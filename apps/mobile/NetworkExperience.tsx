import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path } from "react-native-svg";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ContextGraph, type ContextNode } from "./ContextGraph";
import { useReducedMotion } from "./useReducedMotion";
import { friendlyError } from "./friendlyError";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NetworkStats as Stats } from "../../packages/core/network";
import { FormationVisual } from './FormationVisual';

const evidence: Record<string, string> = {
  "demo-simulation": "A simulated connection or extracted demo conversation. Not a claim that another attendee reviewed or approved it.",
  "accepted-connection":
    "A connection you both accepted. This is not an inferred friendship.",
  "self-declared":
    "Explicitly selected in your profile. Self-declared context, not verified expertise.",
  "mutually-approved":
    "Both people reviewed and approved this conversation memory.",
  "reviewed-learning":
    "A private learning capture you reviewed. Learning is not a claim of expertise; attendance is self-reported separately.",
  "reviewed-goal":
    "A private goal you reviewed and approved. It describes intent, not an achieved skill.",
};

export function NetworkOrbit({
  authenticated,
  connected,
  width,
  onPerson,
}: {
  authenticated: boolean;
  connected: boolean;
  width: number;
  onPerson: (id: string) => void;
}) {
  const data = useQuery(api.network.mine, authenticated ? {} : "skip");
  const refresh = useMutation(api.network.refresh),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (data?.status === "ready") {
    const nodes: ContextNode[] = data.graph.nodes.map((node) => ({
      ...node,
      description: node.detail,
      provenance:
        node.kind === "area"
          ? "Linked by self-declared profiles or reviewed notes. Follow its returned relationships to see the source; this is not proof of expertise."
          : evidence[node.evidence] || "Private reviewed context.",
      connectionId:
        node.kind === "person" ? node.id.replace(/^person:/, "") : undefined,
    }));
    return (
      <ContextGraph
        size={Math.min(width - 30, 450)}
        onPerson={onPerson}
        map={{
          nodes,
          edges: data.graph.edges,
          revision: data.revision,
          live: connected,
          statusLabel: connected
            ? "Your connections, in context"
            : "Saved graph · offline",
        }}
      />
    );
  }
  return (
    <View style={s.loadingGraph}>
      <FormationVisual size={Math.min(width-60,260)} phase="connecting"/>
      <Text style={s.waitTitle}>
        {data?.status === "error"
          ? "Your context is still here."
          : data?.status === "idle"
            ? "Give your world a little shape."
            : "Connecting the good parts…"}
      </Text>
      <Text style={s.copy}>
        {data?.status === "error"
          ? "The graph couldn’t refresh. Your saved connections and reviewed captures remain private."
          : "Your private graph grows from accepted connections and reviewed context. Nothing is invented to fill the space."}
      </Text>
      {data?.stats && (
        <Text style={s.meta}>
          {data.stats.connections} accepted connections ·{" "}
          {data.stats.sharedMemories} shared memories
        </Text>
      )}
      {!data || data.status === "loading" ? (
        <ActivityIndicator color="#c4afea" style={{ marginTop: 22 }} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh private context graph"
          disabled={!connected || busy}
          onPress={async () => {
            setBusy(true);
            setError("");
            try {
              await refresh({});
            } catch (e) {
              setError(friendlyError(e, "Couldn’t refresh your context."));
            } finally {
              setBusy(false);
            }
          }}
          style={s.outlineButton}
        >
          <Text style={s.outlineText}>
            {busy ? "Requesting graph…" : "Refresh network"}
          </Text>
        </Pressable>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
      <Text style={s.meta}>Saved connections · visualization updating</Text>
    </View>
  );
}

export { WrappedLauncher } from './ConferenceWrapped';
function LegacyWrappedLauncher({
  authenticated,
  connected,
  onNetwork,
}: {
  authenticated: boolean;
  connected: boolean;
  onNetwork?: () => void;
}) {
  const data = useQuery(api.network.mine, authenticated ? {} : "skip"),
    [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open my Network Wrapped"
        disabled={!data}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          opacity: pressed ? 0.85 : 1,
          marginVertical: 19,
        })}
      >
        <LinearGradient
          colors={["#3d315c", "#233c3c", "#26322f"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.launcher}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>END CONFERENCE · DEMO RECAP</Text>
            <Text style={s.launchTitle}>Your conference,{"\n"}wrapped.</Text>
            <Text style={s.launchCopy}>
              {data
                ? `${data.stats.connections} ${data.stats.connections === 1 ? "connection" : "connections"}. Your own kind of momentum.`
                : "Preparing your private snapshot…"}
            </Text>
          </View>
          <View style={s.miniOrbit}>
            <View style={s.miniRing} />
            <View style={[s.miniRing, { transform: [{ rotate: "62deg" }] }]} />
            <View style={[s.miniRing, { transform: [{ rotate: "-62deg" }] }]} />
            <View style={s.miniCore}>
              <Ionicons name="arrow-forward" size={20} color="#2a2341" />
            </View>
          </View>
        </LinearGradient>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="End conference" disabled={!data} onPress={()=>setOpen(true)} style={s.outlineButton}><Text style={s.outlineText}>End conference → see my Wrapped</Text></Pressable>
      {open && data && (
        <WrappedStories
          stats={data.stats}
          generatedAt={data.generatedAt}
          live={connected && data.status === "ready"}
          onClose={() => setOpen(false)}
          onNetwork={() => {
            setOpen(false);
            onNetwork?.();
          }}
        />
      )}
    </>
  );
}

function Count({ value, color }: { value: number; color: string }) {
  const reduced = useReducedMotion(),
    progress = useRef(new Animated.Value(0)).current,
    [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    progress.setValue(0);
    const listener = progress.addListener(({ value: amount }) =>
      setShown(Math.round(value * amount)),
    );
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 950,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(listener);
    };
  }, [value, reduced]);
  return (
    <Text
      testID="wrapped-count"
      accessibilityLabel={`${value}`}
      style={[s.bigNumber, { color }]}
    >
      {shown}
    </Text>
  );
}

function WrappedStories({
  stats,
  generatedAt,
  live,
  onClose,
  onNetwork,
}: {
  stats: Stats;
  generatedAt: number | null;
  live: boolean;
  onClose: () => void;
  onNetwork: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion(),
    [page, setPage] = useState(0),
    entrance = useRef(new Animated.Value(1)).current;
  const themes = [
    {
      background: ["#c6b0f3", "#9b91dd"] as const,
      ink: "#30213f",
      soft: "#5d4979",
      accent: "#e4ffe8",
    },
    {
      background: ["#a4e8cd", "#70c5b4"] as const,
      ink: "#173b36",
      soft: "#3b6c5c",
      accent: "#e9f7b6",
    },
    {
      background: ["#242535", "#171a28"] as const,
      ink: "#f3eafa",
      soft: "#b3a6c4",
      accent: "#c8b0ef",
    },
    {
      background: ["#f4b797", "#df9e94"] as const,
      ink: "#482a34",
      soft: "#86505b",
      accent: "#f9e3b5",
    },
    {
      background: ["#daeab1", "#accf9e"] as const,
      ink: "#284436",
      soft: "#5b765b",
      accent: "#f3ffdc",
    },
  ];
  const theme = themes[page];
  useEffect(() => {
    entrance.setValue(reduced ? 1 : 0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [page, reduced]);
  const areas = [...stats.areas]
    .filter((area) => area.connections || area.memoryCount)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.connections - a.connections ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  return (
    <Modal
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <LinearGradient
        colors={theme.background}
        style={[
          s.story,
          {
            paddingTop: Math.max(40, insets.top + 12),
            paddingBottom: Math.max(24, insets.bottom + 12),
          },
        ]}
      >
        <View style={s.storyProgress}>
          {themes.map((_, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Wrapped story ${i + 1} of 5`}
              onPress={() => setPage(i)}
              style={[s.progressTrack, { backgroundColor: theme.ink + "25" }]}
            >
              <View
                style={{
                  height: 3,
                  borderRadius: 4,
                  width: i <= page ? "100%" : "0%",
                  backgroundColor: theme.ink,
                }}
              />
            </Pressable>
          ))}
        </View>
        <View style={s.storyTop}>
          <Text style={[s.storyBrand, { color: theme.ink }]}>
            conferenceos. <Text style={{ fontWeight: "400" }}>wrapped</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Network Wrapped"
            onPress={onClose}
            style={[s.storyClose, { backgroundColor: theme.ink + "14" }]}
          >
            <Ionicons name="close" color={theme.ink} size={23} />
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 15 }}
        >
          <Animated.View
            key={page}
            testID={`wrapped-story-${page + 1}`}
            style={{
              flex: 1,
              opacity: entrance,
              transform: [
                {
                  translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            }}
          >
            <Text style={[s.storyKicker, { color: theme.soft }]}>
              {
                [
                  "01 / YOUR PEOPLE",
                  "02 / THE CONVERSATIONS",
                  "03 / YOUR CONTEXT",
                  "04 / WHAT YOU’RE LEARNING",
                  "05 / KEEP IT GROWING",
                ][page]
              }
            </Text>
            {page === 0 && (
              <>
                <Text
                  accessibilityRole="header"
                  style={[s.storyTitle, { color: theme.ink }]}
                >
                  {stats.connections
                    ? "Your world got\nmore interesting."
                    : "Every orbit starts\nwith a hello."}
                </Text>
                <View style={s.numberStage}>
                  <Svg
                    width="100%"
                    height="230"
                    style={StyleSheet.absoluteFill}
                  >
                    <Circle
                      cx="50%"
                      cy="50%"
                      r="100"
                      fill="none"
                      stroke={theme.ink}
                      strokeOpacity=".2"
                      strokeWidth="1"
                    />
                    <Circle
                      cx="50%"
                      cy="50%"
                      r="78"
                      fill="none"
                      stroke={theme.ink}
                      strokeOpacity=".16"
                      strokeWidth="20"
                      strokeDasharray="2 10"
                    />
                    <Path
                      d="M 10 185 Q 180 260 330 40"
                      fill="none"
                      stroke={theme.accent}
                      strokeWidth="3"
                    />
                  </Svg>
                  <Count value={stats.connections} color={theme.ink} />
                </View>
                <Text style={[s.metricLabel, { color: theme.ink }]}>
                  accepted connections
                </Text>
                <Text style={[s.storyCopy, { color: theme.soft }]}>
                  People you chose. People who chose you back. Not followers.
                  Not guessed relationships.
                </Text>
              </>
            )}
            {page === 1 && (
              <>
                <Text
                  accessibilityRole="header"
                  style={[s.storyTitle, { color: theme.ink }]}
                >
                  You kept more{"\n"}than a name.
                </Text>
                <View style={s.memoryArt}>
                  <View
                    style={[
                      s.memoryCard,
                      {
                        backgroundColor: theme.ink,
                        transform: [{ rotate: "-9deg" }],
                      },
                    ]}
                  />
                  <View
                    style={[
                      s.memoryCard,
                      {
                        backgroundColor: theme.accent,
                        transform: [{ rotate: "5deg" }],
                      },
                    ]}
                  >
                    <Ionicons
                      name="chatbubbles-outline"
                      size={35}
                      color={theme.ink}
                    />
                    <Text
                      testID="wrapped-shared-memories"
                      style={[s.cardNumber, { color: theme.ink }]}
                    >
                      {stats.sharedMemories}
                    </Text>
                    <Text style={[s.cardCaption, { color: theme.ink }]}>
                      shared memories
                    </Text>
                  </View>
                </View>
                <Text style={[s.storyCopy, { color: theme.soft }]}>
                  {stats.demoMemories ? `${stats.demoMemories} owner-reviewed demo memories included. Real shared memories require both people’s approval. A little context makes the` : 'Every one reviewed by both people. A little context makes the'}
                  next conversation feel less like starting over.
                </Text>
                <View
                  style={[s.storyChip, { backgroundColor: theme.ink + "12" }]}
                >
                  <Text style={[s.chipValue, { color: theme.ink }]}>
                    {stats.contextLinks}
                  </Text>
                  <Text style={[s.chipLabel, { color: theme.soft }]}>
                    private context links in this snapshot
                  </Text>
                </View>
              </>
            )}
            {page === 2 && (
              <>
                <Text
                  accessibilityRole="header"
                  style={[s.storyTitle, { color: theme.ink }]}
                >
                  The things that{"\n"}bring you together.
                </Text>
                <Text style={[s.storyCopy, { color: theme.soft }]}>
                  Your strongest areas of shared context. This is connection
                  depth—not a rating of anyone’s talent.
                </Text>
                <View style={{ marginTop: 26 }}>
                  {areas.length ? (
                    areas.map((area, i) => (
                      <View key={area.id} style={s.areaCard}>
                        <View style={s.areaHeading}>
                          <Text style={[s.areaRank, { color: area.color }]}>
                            {String(i + 1).padStart(2, "0")}
                          </Text>
                          <Text style={[s.areaName, { color: theme.ink }]}>
                            {area.label}
                          </Text>
                          <Text
                            testID={`wrapped-area-score-${area.id}`}
                            style={[s.areaScore, { color: area.color }]}
                          >
                            {area.score}
                          </Text>
                        </View>
                        <View style={s.areaTrack}>
                          <View
                            style={{
                              width: `${Math.max(0, Math.min(100, area.score))}%`,
                              height: 5,
                              borderRadius: 5,
                              backgroundColor: area.color,
                            }}
                          />
                        </View>
                        <Text style={[s.areaDetail, { color: theme.soft }]}>
                          {area.connections}{" "}
                          {area.connections === 1
                            ? "connection"
                            : "connections"}{" "}
                          · {area.memoryCount}{" "}
                          {area.memoryCount === 1
                            ? "shared memory"
                            : "shared memories"}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={s.noAreas}>
                      <Ionicons
                        name="sparkles-outline"
                        color={theme.accent}
                        size={36}
                      />
                      <Text style={[s.storyCopy, { color: theme.soft }]}>
                        Your story is still taking shape. Approved shared
                        context will appear here.
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[s.formula, { color: theme.soft }]}>
                  CONTEXT INDEX · DEMO FORMULA{"\n"}min(100, 15 × connections +
                  10 × shared memories). A deterministic summary, never a
                  verified skill score. Reviewed learning is separate.
                </Text>
              </>
            )}
            {page === 3 && (
              <>
                <Text
                  accessibilityRole="header"
                  style={[s.storyTitle, { color: theme.ink }]}
                >
                  Curiosity looks{"\n"}good on you.
                </Text>
                <View style={s.learningGrid}>
                  <View
                    style={[s.learningBig, { backgroundColor: theme.accent }]}
                  >
                    <Ionicons
                      name="sparkles-outline"
                      size={30}
                      color={theme.ink}
                    />
                    <Text
                      testID="wrapped-learning-count"
                      style={[s.learningNumber, { color: theme.ink }]}
                    >
                      {stats.learningCaptures}
                    </Text>
                    <Text style={[s.learningLabel, { color: theme.ink }]}>
                      reviewed learning captures
                    </Text>
                  </View>
                  <View style={s.learningColumn}>
                    <View
                      style={[
                        s.learningSmall,
                        { backgroundColor: theme.ink + "13" },
                      ]}
                    >
                      <Text
                        testID="wrapped-attendance-count"
                        style={[s.smallNumber, { color: theme.ink }]}
                      >
                        {stats.sessionsAttended}
                      </Text>
                      <Text style={[s.smallCaption, { color: theme.soft }]}>
                        sessions attended{"\n"}self-reported
                      </Text>
                    </View>
                    <View
                      style={[
                        s.learningSmall,
                        { backgroundColor: theme.ink + "13" },
                      ]}
                    >
                      <Text style={[s.smallNumber, { color: theme.ink }]}>
                        {stats.goalsReviewed}
                      </Text>
                      <Text style={[s.smallCaption, { color: theme.soft }]}>
                        goals reviewed
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={[s.storyCopy, { color: theme.soft }]}>
                  These are things you explored and reviewed. Learning about an
                  area doesn’t turn it into a skill claim.
                </Text>
              </>
            )}
            {page === 4 && (
              <>
                <Text
                  accessibilityRole="header"
                  style={[s.storyTitle, { color: theme.ink }]}
                >
                  The best part?{"\n"}You’re not done.
                </Text>
                <View style={s.numberStage}>
                  <Count value={stats.recentConnections} color={theme.ink} />
                  <View
                    style={[s.weekBadge, { backgroundColor: theme.accent }]}
                  >
                    <Text style={[s.weekText, { color: theme.ink }]}>
                      LAST 7 DAYS
                    </Text>
                  </View>
                </View>
                <Text style={[s.metricLabel, { color: theme.ink }]}>
                  new accepted connections
                </Text>
                <Text style={[s.storyCopy, { color: theme.soft }]}>
                  A good follow-up starts with something real. Return to your
                  people, add context, and see where the conversation goes.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Return to my network"
                  onPress={onNetwork}
                  style={[s.storyCTA, { backgroundColor: theme.ink }]}
                >
                  <Text
                    style={{
                      color: theme.accent,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Back to my people
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={theme.accent}
                  />
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
        <View style={s.storyFooter}>
          <Text style={[s.snapshot, { color: theme.soft }]}>
            {live
              ? "Your private network snapshot"
              : "Saved snapshot · connection unavailable"}
            {generatedAt
              ? ` · ${new Date(generatedAt).toLocaleDateString()}`
              : ""}
            {"\n"}Only your private snapshot. Nothing posted.
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous Wrapped story"
              disabled={page === 0}
              onPress={() => setPage(page - 1)}
              style={[
                s.storyNav,
                { borderColor: theme.ink + "30", opacity: page ? 1 : 0.3 },
              ]}
            >
              <Ionicons name="arrow-back" color={theme.ink} size={20} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                page === 4 ? "Finish Network Wrapped" : "Next Wrapped story"
              }
              onPress={() => (page === 4 ? onClose() : setPage(page + 1))}
              style={[s.storyNav, { borderColor: theme.ink + "30" }]}
            >
              <Ionicons
                name={page === 4 ? "checkmark" : "arrow-forward"}
                color={theme.ink}
                size={20}
              />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

export function NetworkPresentation({ connected }: { connected: boolean }) {
  const data = useQuery(api.network.mine, {}),
    setPresentation = useMutation(api.network.setPresentation),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View style={s.privacy}>
      <View style={{ flex: 1 }}>
        <Text style={s.privacyTitle}>Your context, on the big screen.</Text>
        <Text style={s.copy}>
          Allow anonymized network shape + context links on your paired desktop.
          Names, specific areas, conversation text and raw media stay private.
        </Text>
        <Text style={s.meta}>
          {data?.presentationEnabled
            ? "ANONYMIZED SHARING ON"
            : "ANONYMIZED SHARING OFF"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Share anonymized context graph with paired desktop"
        accessibilityState={{ checked: !!data?.presentationEnabled }}
        aria-checked={!!data?.presentationEnabled}
        disabled={busy || !connected || !data}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await setPresentation({ enabled: !data?.presentationEnabled });
          } catch (e) {
            setError(friendlyError(e, "Couldn’t update presentation consent."));
          } finally {
            setBusy(false);
          }
        }}
        style={[
          s.switch,
          {
            backgroundColor: data?.presentationEnabled ? "#b9a4e5" : "#393044",
          },
        ]}
      >
        <View
          style={[
            s.switchDot,
            {
              alignSelf: data?.presentationEnabled ? "flex-end" : "flex-start",
            },
          ]}
        />
      </Pressable>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  launcher: {
    padding: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#4c435e",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    minHeight: 165,
  },
  eyebrow: {
    color: "#bdb1d5",
    fontSize: 8,
    letterSpacing: 1.8,
    fontWeight: "600",
  },
  launchTitle: {
    fontSize: 26,
    lineHeight: 29,
    letterSpacing: -0.8,
    color: "#f0e8fb",
    fontWeight: "600",
    marginTop: 10,
  },
  launchCopy: { fontSize: 10, lineHeight: 16, color: "#c0bdca", marginTop: 12 },
  miniOrbit: {
    width: 90,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  miniRing: {
    position: "absolute",
    width: 90,
    height: 40,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "#b9e8d2",
  },
  miniCore: {
    width: 37,
    height: 37,
    borderRadius: 20,
    backgroundColor: "#c8b0ed",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingGraph: {
    padding: 25,
    minHeight: 350,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOrb: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: "#59476c",
    backgroundColor: "#29213d",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  waitTitle: {
    color: "#e4d7f3",
    fontSize: 23,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  copy: { fontSize: 12, lineHeight: 20, color: "#aea0bf", marginTop: 11 },
  meta: { color: "#8d819e", fontSize: 9, lineHeight: 16, marginTop: 14 },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#78618e",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 20,
  },
  outlineText: { color: "#d2bceb", fontSize: 12 },
  error: { color: "#e6afbd", fontSize: 11, lineHeight: 18, marginTop: 12 },
  story: { flex: 1, paddingTop: 53, paddingHorizontal: 26, paddingBottom: 29 },
  storyProgress: { flexDirection: "row", gap: 5 },
  progressTrack: { flex: 1, height: 3, borderRadius: 4, paddingVertical: 0 },
  storyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 28,
  },
  storyBrand: { fontWeight: "700", fontSize: 15, letterSpacing: -0.6 },
  storyClose: { padding: 9, borderRadius: 24 },
  storyKicker: {
    fontSize: 9,
    letterSpacing: 1.7,
    fontWeight: "700",
    marginBottom: 19,
  },
  storyTitle: {
    fontSize: 39,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -1.8,
  },
  numberStage: {
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 5,
  },
  bigNumber: {
    fontSize: 142,
    lineHeight: 173,
    fontWeight: "800",
    letterSpacing: -8,
  },
  metricLabel: {
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  storyCopy: { fontSize: 14, lineHeight: 23, marginTop: 20 },
  memoryArt: {
    height: 235,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
  },
  memoryCard: {
    position: "absolute",
    width: 210,
    height: 205,
    borderRadius: 27,
    padding: 22,
    justifyContent: "space-between",
  },
  cardNumber: {
    fontSize: 78,
    lineHeight: 83,
    fontWeight: "700",
    letterSpacing: -4,
  },
  cardCaption: { fontSize: 15, fontWeight: "600" },
  storyChip: {
    borderRadius: 18,
    padding: 15,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 24,
  },
  chipValue: { fontSize: 30, fontWeight: "700", letterSpacing: -1 },
  chipLabel: { flex: 1, fontSize: 12, lineHeight: 18 },
  areaCard: { marginBottom: 23 },
  areaHeading: { flexDirection: "row", gap: 12, alignItems: "center" },
  areaRank: { fontSize: 14, fontWeight: "600" },
  areaName: { fontSize: 17, fontWeight: "600", flex: 1 },
  areaScore: { fontSize: 26, fontWeight: "700", letterSpacing: -1 },
  areaTrack: {
    height: 5,
    backgroundColor: "#464052",
    borderRadius: 5,
    marginTop: 13,
  },
  areaDetail: { fontSize: 10, marginTop: 9 },
  formula: { fontSize: 10, lineHeight: 18, marginTop: 13 },
  noAreas: {
    padding: 26,
    borderWidth: 1,
    borderColor: "#484051",
    borderRadius: 24,
  },
  learningGrid: { flexDirection: "row", gap: 12, marginTop: 32 },
  learningBig: {
    flex: 1,
    padding: 20,
    borderRadius: 26,
    minHeight: 270,
    justifyContent: "space-between",
  },
  learningNumber: { fontSize: 79, fontWeight: "700", letterSpacing: -4 },
  learningLabel: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  learningColumn: { flex: 1, gap: 12 },
  learningSmall: {
    flex: 1,
    borderRadius: 24,
    padding: 19,
    justifyContent: "center",
  },
  smallNumber: { fontSize: 42, fontWeight: "700", letterSpacing: -2 },
  smallCaption: { fontSize: 11, lineHeight: 17, marginTop: 6 },
  weekBadge: {
    position: "absolute",
    bottom: 23,
    right: 20,
    padding: 12,
    borderRadius: 20,
    transform: [{ rotate: "-10deg" }],
  },
  weekText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  storyCTA: {
    padding: 18,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
  },
  storyFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  snapshot: { flex: 1, fontSize: 8, lineHeight: 13 },
  storyNav: {
    width: 42,
    height: 42,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  privacy: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#393046",
    backgroundColor: "#1b1927",
    marginTop: 20,
    flexDirection: "row",
    gap: 13,
    flexWrap: "wrap",
  },
  privacyTitle: { fontSize: 17, color: "#e1d3ee", fontWeight: "500" },
  switch: { width: 47, height: 28, borderRadius: 20, padding: 4, marginTop: 2 },
  switchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f0e5fb",
  },
});
