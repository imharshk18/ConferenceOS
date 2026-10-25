import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, {
  Circle,
  Defs,
  Line,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { speakers } from "../../packages/core/data";
import { NetworkOrbit, WrappedLauncher } from "./NetworkExperience";

export type OrbitNode = {
  id: string;
  name: string;
  color?: string;
  photoUrl?: string;
  kind?: string;
};
type Point = { x: number; y: number; z: number };
const palette = ["#beacff", "#84f4db", "#ffb9cf", "#a8c7ff", "#e5f79b"];
const coordinates = (i: number, count: number): Point => {
  const y = 1 - (i / Math.max(1, count - 1)) * 2;
  const r = Math.sqrt(1 - y * y),
    angle = i * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r };
};
const rotate = (p: Point, yaw: number, pitch: number): Point => {
  const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
  const z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  return {
    x,
    y: p.y * Math.cos(pitch) - z * Math.sin(pitch),
    z: p.y * Math.sin(pitch) + z * Math.cos(pitch),
  };
};

export function Portrait({
  node,
  size = 48,
}: {
  node: OrbitNode;
  size?: number;
}) {
  const seed = [...node.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const color = node.color || palette[seed % palette.length];
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // An abstract portrait, deliberately not a fabricated photograph.
  return (
    <View
      accessibilityLabel={
        loaded ? node.name : `${node.name}, illustrated avatar`
      }
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: size * 0.7,
          height: size * 0.65,
          borderRadius: size * 0.35,
          backgroundColor: "#393350",
          left: size * 0.15,
          top: size * 0.58,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.37,
          height: size * 0.45,
          borderRadius: size * 0.2,
          backgroundColor: "#fbdbc7",
          left: size * 0.315,
          top: size * 0.2,
          transform: [{ rotate: `${(seed % 16) - 8}deg` }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.4,
          height: size * 0.18,
          borderTopLeftRadius: size * 0.2,
          borderTopRightRadius: size * 0.2,
          backgroundColor: "#302b41",
          left: size * 0.3,
          top: size * 0.15,
        }}
      />
      {node.photoUrl && !failed && (
        <Image
          source={{ uri: node.photoUrl }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={[
            StyleSheet.absoluteFill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              opacity: loaded ? 1 : 0,
            },
          ]}
          accessibilityLabel={node.name}
        />
      )}
    </View>
  );
}

export function LivingGlobe({
  size,
  nodes,
  onSelect,
  ego = false,
}: {
  size: number;
  nodes: OrbitNode[];
  onSelect: (node: OrbitNode) => void;
  ego?: boolean;
}) {
  const [angles, setAngles] = useState({ yaw: 0.35, pitch: -0.18 });
  const current = useRef(angles),
    dragging = useRef(false),
    origin = useRef(angles);
  const reduced = useRef(true);
  const active = useRef(AppState.currentState === "active");
  const phase = useRef(0);
  const seen = useRef(new Set<string>());
  const [arrivals, setArrivals] = useState<string[]>([]);
  const nodeSignature = nodes.map((n) => n.id).join("|");
  useEffect(() => {
    if (!ego) {
      setArrivals([]);
      return;
    }
    const ids = nodeSignature ? nodeSignature.split("|") : [];
    const added = ids.filter((id) => !seen.current.has(id));
    seen.current = new Set(ids);
    setArrivals(added);
    if (!added.length) return;
    const timeout = setTimeout(() => setArrivals([]), 2800);
    return () => clearTimeout(timeout);
  }, [nodeSignature, ego]);
  const count = Math.max(100, nodes.length * 9);
  const points = useMemo(
    () => Array.from({ length: count }, (_, i) => coordinates(i, count)),
    [count],
  );
  useEffect(() => {
    let mounted = true;
    let frame = 0,
      previous = 0;
    const tick = (time: number) => {
      if (!mounted) return;
      frame = requestAnimationFrame(tick);
      if (time - previous < 1000 / 30) return;
      const elapsed = Math.min(70, previous ? time - previous : 33);
      previous = time;
      if (!active.current || reduced.current) return;
      phase.current += elapsed;
      if (!dragging.current)
        current.current = {
          ...current.current,
          yaw: current.current.yaw + elapsed * 0.00014,
        };
      setAngles({ ...current.current });
    };
    frame = requestAnimationFrame(tick);
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        reduced.current = value;
        setAngles({ ...current.current });
      }
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reduced.current = value;
        setAngles({ ...current.current });
      },
    );
    const stateListener = AppState.addEventListener("change", (value) => {
      active.current = value === "active";
      previous = 0;
    });
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      listener.remove();
      stateListener.remove();
    };
  }, []);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        dragging.current = true;
        origin.current = current.current;
      },
      onPanResponderMove: (_, g) => {
        current.current = {
          yaw: origin.current.yaw + g.dx / 110,
          pitch: Math.max(
            -1.2,
            Math.min(1.2, origin.current.pitch + g.dy / 160),
          ),
        };
        setAngles(current.current);
      },
      onPanResponderRelease: () => {
        dragging.current = false;
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
      },
    }),
  ).current;
  const radius = size * 0.375,
    center = size / 2;
  const project = (p: Point) => {
    const r = rotate(
        p,
        angles.yaw,
        angles.pitch +
          (reduced.current ? 0 : Math.sin(phase.current / 6000) * 0.045),
      ),
      perspective = 2.8 / (2.8 - r.z * 0.26);
    return {
      x: center + r.x * radius * perspective,
      y: center + r.y * radius * perspective,
      z: r.z,
    };
  };
  const projected = points.map(project);
  const nodePoints = nodes
    .slice(0, 16)
    .map((node, i) => ({
      node,
      ...project(coordinates(i + 1, Math.min(nodes.length, 16) + 2)),
    }))
    .sort((a, b) => a.z - b.z);
  const lines = Array.from({ length: 9 }, (_, latitude) => {
    const lat = ((latitude - 4) * Math.PI) / 12;
    return Array.from({ length: 65 }, (_, i) => {
      const longitude = (i / 64) * Math.PI * 2;
      return project({
        x: Math.cos(lat) * Math.cos(longitude),
        y: Math.sin(lat),
        z: Math.cos(lat) * Math.sin(longitude),
      });
    });
  });
  // Unattached orbital paths are scenery, never inferred speaker relationships.
  const orbitPoint = (orbit: number, amount: number) => {
    const angle = amount * Math.PI * 2,
      tilt = -0.6 + orbit * 0.51;
    return project({
      x: Math.cos(angle) * 1.1,
      y: Math.sin(angle) * Math.cos(tilt) * 0.38,
      z: Math.sin(angle) * Math.sin(tilt) * 1.2,
    });
  };
  return (
    <View
      style={{ width: size, height: size }}
      {...pan.panHandlers}
      accessibilityLabel="Official speaker orbit. Drag to rotate and tap a speaker. Orbital lines are decorative, not relationships."
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="atmosphere">
            <Stop offset="0" stopColor="#7763bc" stopOpacity=".3" />
            <Stop offset=".7" stopColor="#8575ef" stopOpacity=".08" />
            <Stop offset="1" stopColor="#8f79ff" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="planet">
            <Stop offset="0" stopColor="#29253e" stopOpacity=".8" />
            <Stop offset=".65" stopColor="#151923" stopOpacity=".5" />
            <Stop offset="1" stopColor="#12151f" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={size * 0.5}
          fill="url(#atmosphere)"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="url(#planet)"
          stroke="#a18ad2"
          strokeOpacity=".08"
          strokeWidth=".5"
        />
        {lines.map((line, i) => (
          <Path
            key={i}
            d={line.map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#a99ee6"
            strokeWidth=".45"
            opacity={0.045}
          />
        ))}
        {projected.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.z > 0 ? 1.3 : 0.7}
            fill={palette[i % palette.length]}
            opacity={0.08 + (p.z + 1) * 0.23}
          />
        ))}
        {[0, 1, 2].map((orbit) => {
          const path = Array.from({ length: 65 }, (_, i) =>
            orbitPoint(orbit, i / 64),
          );
          const t = (phase.current / (9500 + orbit * 1800) + orbit * 0.31) % 1;
          const dot = orbitPoint(orbit, t);
          const trail = Array.from({ length: 14 }, (_, i) =>
            orbitPoint(orbit, t - i * 0.0025),
          );
          return (
            <React.Fragment key={`orbit-${orbit}`}>
              <Path
                d={path
                  .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke={orbit === 1 ? "#a8e5dc" : "#aa9dcf"}
                strokeWidth=".65"
                opacity=".16"
              />
              {!reduced.current && (
                <>
                  <Path
                    d={trail
                      .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="#b9fbe7"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity=".5"
                  />
                  <Circle
                    cx={dot.x}
                    cy={dot.y}
                    r="6"
                    fill="#b5ffe5"
                    opacity=".06"
                  />
                  <Circle
                    testID="speaker-orbit-particle"
                    cx={dot.x}
                    cy={dot.y}
                    r="2"
                    fill="#d7ffef"
                    opacity=".9"
                  />
                </>
              )}
            </React.Fragment>
          );
        })}
        {ego &&
          nodePoints.map((p, i) => (
            <Line
              key={p.node.id}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke={palette[i % palette.length]}
              strokeWidth={0.8}
              opacity={p.z > 0 ? 0.5 : 0.2}
            />
          ))}
        <Path
          d={`M ${size * 0.06},${size * 0.63} Q ${size * 0.48},${size * 0.96} ${size * 0.94},${size * 0.34}`}
          stroke="#a89cfa"
          strokeWidth=".6"
          opacity=".3"
          fill="none"
        />
      </Svg>
      {ego && nodes.length > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: center - 15,
            top: center - 15,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: "#252337",
            borderWidth: 1,
            borderColor: "#c1acee",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#d8c9f5", fontSize: 7, letterSpacing: 1 }}>
            YOU
          </Text>
        </View>
      )}
      {nodePoints.map((p) => {
        const scale = 0.7 + (p.z + 1) * 0.22,
          diameter = 35 * scale;
        return (
          <Pressable
            key={p.node.id}
            onPress={() => onSelect(p.node)}
            accessibilityLabel={`View ${p.node.name}`}
            style={({ pressed }) => ({
              position: "absolute",
              left: p.x - diameter / 2,
              top: p.y - diameter / 2,
              padding: 2,
              borderRadius: 50,
              backgroundColor: "#151a2b",
              borderWidth: 1,
              borderColor: (p.node.color || "#baadff") + "75",
              opacity: pressed ? 0.65 : 0.52 + (p.z + 1) * 0.24,
              shadowColor: "#b6a1ee",
              shadowOpacity: p.z > 0.1 ? 0.22 : 0,
              shadowRadius: 13,
              shadowOffset: { width: 0, height: 0 },
              transform: [{ scale: pressed ? 0.9 : 1 }],
            })}
          >
            <Portrait node={p.node} size={diameter} />
            {ego && arrivals.includes(p.node.id) && (
              <ArrivalRing size={diameter} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function ArrivalRing({ size }: { size: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active || reduce) return;
      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        { iterations: 2 },
      ).start();
    });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [progress]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel="New connection in your orbit"
      style={{
        position: "absolute",
        width: size + 16,
        height: size + 16,
        left: -6,
        top: -6,
        borderRadius: 50,
        borderWidth: 1.5,
        borderColor: "#b3f5db",
        opacity: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 0],
        }),
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.8],
            }),
          },
        ],
      }}
    />
  );
}

export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active) return;
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduce ? 0 : 550,
        delay: reduce ? 0 : delay,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
      opacity.stopAnimation();
    };
  }, [opacity, delay]);
  return (
    <Animated.View
      style={{
        opacity,
        transform: [
          {
            translateY: opacity.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function OrbitHome({
  homeVisit = 0,
  width,
  personalNodes,
  onPerson,
  onSpeaker,
  onNetwork,
  onDiscover,
  onConversation,
  connected,
  authenticated,
}: {
  personalArrival?: boolean;
  homeVisit?: number;
  onConversation?: () => void;
  width: number;
  personalNodes: OrbitNode[];
  onPerson: (id: string) => void;
  onSpeaker: (id: string) => void;
  onNetwork: () => void;
  onDiscover: () => void;
  connected: boolean;
  authenticated: boolean;
  children?: React.ReactNode;
}) {
  const [scope, setScope] = useState<"conference" | "personal">("conference");
  useEffect(() => setScope("conference"), [homeVisit]);
  const conferenceNodes: OrbitNode[] = speakers
    .filter((s) => !!s.photoUrl)
    .slice(0, 14)
    .map((s) => ({
      id: s.id,
      name: s.name,
      photoUrl: s.photoUrl,
      color: "#b8a7f1",
    }));
  const nodes = scope === "conference" ? conferenceNodes : personalNodes;
  return (
    <>
      <Reveal>
        <View style={s.kicker}>
          <View style={s.dot} />
          <Text style={s.kickerText}>GITHUB UNIVERSE 2026</Text>
          <Text style={s.place}>SAN FRANCISCO</Text>
        </View>
        <Text style={s.title}>
          A world of <Text style={{ color: "#c5b8ff" }}>possibility.</Text>
        </Text>
        <View style={s.segment}>
          {(["conference", "personal"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: scope === value }}
              onPress={() => setScope(value)}
              style={[s.segmentItem, scope === value && s.segmentActive]}
            >
              <Ionicons
                name={
                  value === "conference"
                    ? "planet-outline"
                    : "finger-print-outline"
                }
                size={16}
                color={scope === value ? "#ede9ff" : "#9391a8"}
              />
              <Text
                style={[s.segmentText, scope === value && { color: "#ede9ff" }]}
              >
                {value === "conference" ? "Conference" : "Personal"}
              </Text>
            </Pressable>
          ))}
        </View>
      </Reveal>
      <Reveal delay={90}>
        <View style={s.globeWrap}>
          {scope === "personal" ? (
            <NetworkOrbit
              authenticated={authenticated}
              connected={connected}
              width={width}
              onPerson={onPerson}
            />
          ) : (
            <LivingGlobe
              size={Math.min(width - 30, 450)}
              nodes={nodes}
              ego={false}
              onSelect={(node) =>
                scope === "conference" ? onSpeaker(node.id) : onPerson(node.id)
              }
            />
          )}
        </View>
        <View style={s.orbitMeta}>
          <Text style={s.orbitLabel}>
            {scope === "conference"
              ? "Official speakers · illustrative orbit"
              : "Your people. Your shared context."}
          </Text>
        </View>
      </Reveal>
      <Reveal delay={160}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Discover sessions"
          onPress={onDiscover}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 23,
            borderTopWidth: 1,
            borderColor: "#ffffff12",
            marginTop: 17,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.smallLabel, { color: "#9ed9c8" }]}>
              CURATED FOR YOUR CURIOSITY
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "400",
                letterSpacing: -0.6,
                color: "#f1edf7",
                marginTop: 8,
              }}
            >
              Find your next session.
            </Text>
            <Text style={{ fontSize: 12, color: "#8e93a6", marginTop: 6 }}>
              Ideas worth being in the room for.
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={25} color="#b8e5d7" />
        </Pressable>
        {onConversation && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a conversation"
            onPress={onConversation}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 23,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#ffffff12",
              marginBottom: 22,
              gap: 17,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#b1e4d012",
              }}
            >
              <Ionicons name="mic-outline" size={24} color="#b9dfd3" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 19,
                  fontWeight: "400",
                  letterSpacing: -0.5,
                  color: "#eeeaf5",
                }}
              >
                Start a conversation
              </Text>
              <Text style={{ fontSize: 12, color: "#8e93a6", marginTop: 6 }}>
                Be present. Keep what matters.
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color="#b7aecb" />
          </Pressable>
        )}
      </Reveal>
      <WrappedLauncher
        authenticated={authenticated}
        connected={connected}
        onNetwork={onNetwork}
      />
    </>
  );
}
const s = StyleSheet.create({
  kicker: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#a9edd6" },
  kickerText: {
    color: "#c0becf",
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  place: {
    color: "#77768e",
    fontSize: 8,
    letterSpacing: 1,
    marginLeft: "auto",
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1,
    fontWeight: "400",
    color: "#f4f1ff",
    marginTop: 14,
  },
  subtitle: { color: "#a29eb6", fontSize: 13, lineHeight: 21, marginTop: 9 },
  segment: {
    flexDirection: "row",
    padding: 3,
    backgroundColor: "#17192380",
    borderRadius: 24,
    alignSelf: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#39324670",
  },
  segmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  segmentActive: { backgroundColor: "#353247b0" },
  segmentText: { color: "#9391a8", fontSize: 12, fontWeight: "400" },
  globeWrap: { alignItems: "center", marginHorizontal: -16, marginTop: -8 },
  globeCaption: {
    position: "absolute",
    bottom: 13,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  caption: { color: "#8d89a3", fontSize: 8, letterSpacing: 1.3 },
  orbitMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  orbitLabel: { color: "#9289a6", fontSize: 10 },
  invitation: {
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#424052",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallLabel: { fontSize: 8, letterSpacing: 1.2, color: "#b8b3ce" },
  cardTitle: {
    color: "#f4f0ff",
    fontSize: 20,
    letterSpacing: -0.5,
    fontWeight: "500",
    marginTop: 8,
  },
  faceRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  faceCaption: { color: "#b3aec2", fontSize: 9, flex: 1, marginLeft: 9 },
  arrow: {
    width: 37,
    height: 37,
    borderRadius: 22,
    backgroundColor: "#94b59a25",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 15,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: "#eeeafa",
    letterSpacing: -0.5,
  },
  topicRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  topic: {
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#181a25",
  },
  topicText: { color: "#cbc6db", fontSize: 11 },
  empty: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#202131",
    marginBottom: 20,
  },
  emptyTitle: { color: "#e9e2ff", fontSize: 17 },
});
