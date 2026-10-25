import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Path,
  Polyline,
  RadialGradient,
  Stop,
} from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useReducedMotion } from "./useReducedMotion";

export type ContextNode = {
  id: string;
  label: string;
  kind: string;
  description: string;
  provenance: string;
  color?: string;
  connectionId?: string;
  areaIds?: string[];
};
export type ContextEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
};
export type ContextMap = {
  nodes: ContextNode[];
  edges: ContextEdge[];
  revision: string | number;
  live: boolean;
  statusLabel: string;
};
type Point = { x: number; y: number; z: number };
const colors = ["#bba6ff", "#9ef4d7", "#f5b8cf", "#a4caff", "#e9ebaa"];
const hash = (value: string) =>
  [...value].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const colorFor = (node: ContextNode) =>
  node.color || colors[hash(node.kind) % colors.length];
const iconFor = (
  kind: string,
): React.ComponentProps<typeof Ionicons>["name"] =>
  /person|connection|peer|user|self/i.test(kind)
    ? "person-outline"
    : /memory|conversation/i.test(kind)
      ? "chatbubbles-outline"
      : /session|talk/i.test(kind)
        ? "ticket-outline"
        : /post|source/i.test(kind)
          ? "newspaper-outline"
          : /goal/i.test(kind)
            ? "compass-outline"
            : "sparkles-outline";
const relation = (kind: string) => kind.toLowerCase().replace(/_/g, " ");
const curve = (a: Point, b: Point, t: number): Point => {
  const c = {
    x: (a.x + b.x) * 0.69,
    y: (a.y + b.y) * 0.69 - 0.12,
    z: (a.z + b.z) * 0.69 + 0.22,
  };
  return {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    z: (1 - t) ** 2 * a.z + 2 * (1 - t) * t * c.z + t * t * b.z,
  };
};

/** Geometry is decorative; every rendered relationship comes from the returned graph. */
export function ContextGraph({
  map,
  size,
  onPerson,
}: {
  map: ContextMap;
  size: number;
  onPerson: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [frame, setFrame] = useState({
    yaw: 0.28,
    pitch: -0.15,
    now: Date.now(),
  });
  const camera = useRef(frame),
    drag = useRef(false),
    origin = useRef(frame),
    active = useRef(AppState.currentState === "active");
  const birth = useRef(new Map<string, number>()),
    initialized = useRef(false);
  const nodeBirth = useRef(new Map<string, number>());
  const signature = map.edges.map((edge) => edge.id).join("|");
  useEffect(() => {
    const now = Date.now();
    const keys = new Set(map.edges.map((edge) => edge.id));
    for (const key of birth.current.keys())
      if (!keys.has(key)) birth.current.delete(key);
    map.edges.forEach((edge, index) => {
      if (!birth.current.has(edge.id))
        birth.current.set(
          edge.id,
          now + (initialized.current ? (index % 5) * 70 : index * 55),
        );
    });
    for (const node of map.nodes)
      if (!nodeBirth.current.has(node.id)) nodeBirth.current.set(node.id, now);
    initialized.current = true;
    setFrame((value) => ({ ...value, now }));
  }, [signature, map.revision]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (value) => {
      active.current = value === "active";
    });
    if (reduced || selected) return () => listener.remove();
    let frameId = 0,
      previous = 0;
    const tick = (time: number) => {
      frameId = requestAnimationFrame(tick);
      if (time - previous < 1000 / 30) return;
      const elapsed = Math.min(65, previous ? time - previous : 33);
      previous = time;
      if (!active.current) return;
      if (!drag.current) camera.current.yaw += elapsed * 0.00014;
      setFrame({ ...camera.current, now: Date.now() });
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      listener.remove();
    };
  }, [reduced, selected]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
      onPanResponderGrant: () => {
        drag.current = true;
        origin.current = { ...camera.current };
      },
      onPanResponderMove: (_, gesture) => {
        camera.current = {
          yaw: origin.current.yaw + gesture.dx / 125,
          pitch: Math.max(
            -1.2,
            Math.min(1.2, origin.current.pitch + gesture.dy / 175),
          ),
          now: Date.now(),
        };
        setFrame({ ...camera.current });
      },
      onPanResponderRelease: () => {
        drag.current = false;
      },
      onPanResponderTerminate: () => {
        drag.current = false;
      },
    }),
  ).current;
  const positions = useMemo(() => {
    const sorted = [...map.nodes].sort((a, b) => a.id.localeCompare(b.id));
    return new Map(
      sorted.map((node, index) => {
        const center = /^(you|self|owner)$/i.test(node.kind);
        const y = 1 - (2 * (index + 0.5)) / Math.max(sorted.length, 1),
          radius = Math.sqrt(1 - y * y),
          angle = index * Math.PI * (3 - Math.sqrt(5));
        return [
          node.id,
          center
            ? { x: 0, y: 0, z: 0 }
            : {
                x: Math.cos(angle) * radius,
                y: y * 0.89,
                z: Math.sin(angle) * radius,
              },
        ];
      }),
    );
  }, [map.nodes.map((node) => node.id).join("|")]);
  const project = (point: Point) => {
    const x = point.x * Math.cos(frame.yaw) + point.z * Math.sin(frame.yaw),
      z0 = -point.x * Math.sin(frame.yaw) + point.z * Math.cos(frame.yaw);
    const y = point.y * Math.cos(frame.pitch) - z0 * Math.sin(frame.pitch),
      z = point.y * Math.sin(frame.pitch) + z0 * Math.cos(frame.pitch),
      perspective = 3.3 / (3.3 - z * 0.36);
    return {
      x: size / 2 + x * size * 0.36 * perspective,
      y: size / 2 + y * size * 0.36 * perspective,
      z,
    };
  };
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const filters = [
    ...["person", "memory", "session", "goal"]
      .filter((kind) => map.nodes.some((node) => node.kind === kind))
      .map((kind) => ({
        id: `kind:${kind}`,
        label: (
          {
            person: "People",
            memory: "Conversations",
            session: "Learning",
            goal: "Goals",
          } as Record<string, string>
        )[kind],
        color: "#bba6ff",
      })),
    ...map.nodes
      .filter((node) => node.kind === "area")
      .map((node) => ({
        id: node.id,
        label: node.label,
        color: colorFor(node),
      })),
  ];
  const focusedFilter = filters.find((filter) => filter.id === focus);
  const seeds = new Set(
    map.nodes
      .filter(
        (node) =>
          focusedFilter &&
          (focus?.startsWith("kind:")
            ? node.kind === focus.slice(5)
            : node.id === focus),
      )
      .map((node) => node.id),
  );
  const focusedEdges = new Set(
    map.edges
      .filter((edge) => seeds.has(edge.source) || seeds.has(edge.target))
      .map((edge) => edge.id),
  );
  const focusedNodes = new Set(seeds);
  map.edges.forEach((edge) => {
    if (focusedEdges.has(edge.id)) {
      focusedNodes.add(edge.source);
      focusedNodes.add(edge.target);
    }
  });
  const projected = map.nodes
    .map((node) => ({ node, ...project(positions.get(node.id)!) }))
    .sort((a, b) => a.z - b.z);
  const selectedNode = selected ? nodeById.get(selected) : undefined;
  const nearby = selectedNode
    ? map.edges.filter(
        (edge) =>
          edge.source === selectedNode.id || edge.target === selectedNode.id,
      )
    : [];
  return (
    <>
      {filters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 42, width: size, alignSelf: "center" }}
          contentContainerStyle={{
            gap: 7,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          {[
            { id: "all", label: "Everything", color: "#bba6ff" },
            ...filters,
          ].map((filter) => {
            const chosen =
              filter.id === "all" ? !focusedFilter : filter.id === focus;
            return (
              <Pressable
                key={filter.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${filter.label.toLowerCase()} context`}
                accessibilityState={{ selected: chosen }}
                onPress={() =>
                  setFocus(
                    filter.id === "all" || focus === filter.id
                      ? null
                      : filter.id,
                  )
                }
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 22,
                  backgroundColor: chosen ? filter.color + "24" : "#ffffff04",
                  borderWidth: 0.7,
                  borderColor: chosen ? filter.color + "90" : "#ffffff12",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: chosen ? filter.color : "#a19aae",
                  }}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View
        {...pan.panHandlers}
        accessibilityLabel="Interactive private context graph. Drag to rotate; tap a node to explore."
        style={{ width: size, height: size, alignSelf: "center" }}
      >
        <Svg width={size} height={size} testID="private-context-graph">
          <Defs>
            <RadialGradient id="context-halo">
              <Stop offset="0" stopColor="#7566b7" stopOpacity=".25" />
              <Stop offset=".65" stopColor="#7b6bba" stopOpacity=".065" />
              <Stop offset="1" stopColor="#141521" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size * 0.5}
            fill="url(#context-halo)"
          />
          {[0.33, 0.44].map((radius, index) => (
            <Circle
              key={radius}
              cx={size / 2}
              cy={size / 2}
              r={size * radius}
              fill="none"
              stroke="#b8a6ed"
              strokeWidth=".5"
              opacity={0.065 - index * 0.025}
            />
          ))}
          {map.edges.map((edge, index) => {
            const a = positions.get(edge.source),
              b = positions.get(edge.target);
            if (!a || !b) return null;
            const points = Array.from({ length: 22 }, (_, i) =>
              project(curve(a, b, i / 21)),
            );
            const length = points
              .slice(1)
              .reduce(
                (sum, p, i) =>
                  sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
                0,
              );
            const progress = reduced
              ? 1
              : Math.max(
                  0,
                  Math.min(
                    1,
                    (frame.now - (birth.current.get(edge.id) || frame.now)) /
                      1050,
                  ),
                );
            const t =
                (frame.now / (3100 + (index % 3) * 450) + index * 0.17) % 1,
              dot = project(curve(a, b, t));
            const trail = Array.from({ length: 9 }, (_, i) =>
              project(curve(a, b, Math.max(0, t - i * 0.006))),
            );
            const highlight =
              (!selected ||
                edge.source === selected ||
                edge.target === selected) &&
              (!focusedFilter || focusedEdges.has(edge.id));
            const edgeColor = focusedFilter?.color || "#b9e8df";
            return (
              <React.Fragment key={edge.id}>
                <Path
                  testID={`context-edge-${index}`}
                  accessibilityLabel={`${nodeById.get(edge.source)?.label} ${relation(edge.kind)} ${nodeById.get(edge.target)?.label}`}
                  d={points
                    .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={highlight ? edgeColor : "#84739b"}
                  strokeWidth={highlight ? (focusedFilter ? 1.9 : 1.15) : 0.6}
                  opacity={
                    highlight
                      ? (focusedFilter ? 0.75 : 0.4) + Math.max(0, dot.z) * 0.2
                      : 0.035
                  }
                  strokeDasharray={`${length} ${length}`}
                  strokeDashoffset={length * (1 - progress)}
                />
                {!reduced && progress === 1 && highlight && (
                  <>
                    <Polyline
                      points={trail.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth="2"
                      strokeLinecap="round"
                      opacity=".32"
                    />
                    <Circle
                      cx={dot.x}
                      cy={dot.y}
                      r="6.5"
                      fill="#b1ffe1"
                      opacity=".07"
                    />
                    <Circle
                      testID="context-traveling-point"
                      cx={dot.x}
                      cy={dot.y}
                      r={2.1}
                      fill="#d1ffec"
                      opacity={0.75 + Math.max(0, dot.z) * 0.25}
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}
          {!reduced &&
            projected.map(({ node, x, y }) => {
              const age =
                frame.now - (nodeBirth.current.get(node.id) || frame.now);
              if (age < 0 || age > 2300) return null;
              return (
                <Circle
                  key={`arrival-${node.id}`}
                  testID="context-arrival-ring"
                  cx={x}
                  cy={y}
                  r={20 + age / 95}
                  stroke={colorFor(node)}
                  strokeWidth="1"
                  fill="none"
                  opacity={Math.max(0, 0.6 - age / 3800)}
                />
              );
            })}
        </Svg>
        {projected.map(({ node, x, y, z }) => {
          const diameter = 29 + (z + 1) * 7,
            isSelected = selected === node.id;
          return (
            <Pressable
              key={node.id}
              accessibilityRole="button"
              accessibilityLabel={`Explore context ${node.label}`}
              onPress={() => setSelected(node.id)}
              style={{
                position: "absolute",
                left: x - diameter / 2,
                top: y - diameter / 2,
                width: diameter,
                height: diameter,
                borderRadius: 30,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isSelected ? colorFor(node) : "#201e2ee8",
                borderWidth: 0.8,
                borderColor: colorFor(node) + "b0",
                opacity:
                  focusedFilter && !focusedNodes.has(node.id)
                    ? 0.17
                    : 0.65 + (z + 1) * 0.17,
                shadowColor: colorFor(node),
                shadowOpacity: z > 0 ? 0.35 : 0.08,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <Ionicons
                name={iconFor(node.kind)}
                size={diameter * 0.44}
                color={isSelected ? "#272139" : colorFor(node)}
              />
              {(z > 0.1 || map.nodes.length < 7) && (
                <Text
                  numberOfLines={1}
                  style={{
                    position: "absolute",
                    top: diameter + 5,
                    width: 110,
                    maxWidth: 110,
                    left: (diameter - 110) / 2,
                    textAlign: "center",
                    fontSize: 8,
                    color: "#d1c7e2",
                  }}
                >
                  {node.label}
                </Text>
              )}
            </Pressable>
          );
        })}
        {!map.nodes.length && (
          <View style={s.blank}>
            <Ionicons name="sparkles-outline" size={38} color="#b9a4e5" />
            <Text style={s.blankTitle}>Your next chapter starts here.</Text>
            <Text style={s.copy}>
              Approved context and accepted connections will grow into this
              space.
            </Text>
          </View>
        )}
      </View>
      <View style={[s.legend, { width: size - 20, alignSelf: "center" }]}>
        <View
          style={[
            s.statusDot,
            { backgroundColor: map.live ? "#9ce4ce" : "#ada0bd" },
          ]}
        />
        <Text style={s.tiny}>
          {map.live
            ? "Your private constellation"
            : "Offline · last available view"}
        </Text>
      </View>
      <ScrollView
        horizontal
        style={{ width: size - 10, alignSelf: "center" }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.nodeList}
      >
        {map.nodes.map((node) => (
          <Pressable
            key={node.id}
            accessibilityRole="button"
            accessibilityLabel={`Read context ${node.label}`}
            onPress={() => setSelected(node.id)}
            style={s.nodePill}
          >
            <View style={[s.statusDot, { backgroundColor: colorFor(node) }]} />
            <Text style={s.nodeLabel}>{node.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {selectedNode && (
        <Modal
          transparent
          animationType={reduced ? "none" : "slide"}
          onRequestClose={() => setSelected(null)}
        >
          <View style={s.backdrop}>
            <LinearGradient colors={["#2b253d", "#171923"]} style={s.sheet}>
              <View style={s.heading}>
                <Text style={s.eyebrow}>
                  {selectedNode.kind.toUpperCase()} · YOUR PRIVATE CONTEXT
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close context detail"
                  onPress={() => setSelected(null)}
                  style={s.close}
                >
                  <Ionicons name="close" size={23} color="#eee6fa" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 25 }}>
                <View
                  style={[
                    s.largeIcon,
                    { backgroundColor: colorFor(selectedNode) },
                  ]}
                >
                  <Ionicons
                    name={iconFor(selectedNode.kind)}
                    size={32}
                    color="#302440"
                  />
                </View>
                <Text style={s.detailTitle}>{selectedNode.label}</Text>
                <Text style={s.copy}>{selectedNode.description}</Text>
                <View style={s.provenance}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={17}
                    color="#a7dfce"
                  />
                  <Text style={s.provenanceText}>
                    {selectedNode.provenance}
                  </Text>
                </View>
                <Text style={[s.eyebrow, { marginTop: 28, marginBottom: 12 }]}>
                  HOW IT CONNECTS · {nearby.length}
                </Text>
                {nearby.map((edge) => {
                  const forward = edge.source === selectedNode.id,
                    peer = nodeById.get(forward ? edge.target : edge.source);
                  if (!peer) return null;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Explore related ${peer.label}`}
                      key={edge.id}
                      onPress={() => setSelected(peer.id)}
                      style={s.related}
                    >
                      <Ionicons
                        name={forward ? "arrow-forward" : "arrow-back"}
                        size={17}
                        color="#b6a0e5"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.relation}>{relation(edge.kind)}</Text>
                        <Text style={s.relatedTitle}>{peer.label}</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color="#a896bf"
                      />
                    </Pressable>
                  );
                })}
                {!nearby.length && (
                  <Text style={s.copy}>
                    No relationships are returned for this node yet.
                  </Text>
                )}
                {selectedNode.connectionId && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open this connection"
                    onPress={() => {
                      setSelected(null);
                      onPerson(selectedNode.connectionId!);
                    }}
                    style={s.primary}
                  >
                    <Text style={s.primaryText}>Open this connection</Text>
                    <Ionicons name="arrow-forward" size={18} color="#2c2141" />
                  </Pressable>
                )}
                <Text style={[s.tiny, { marginTop: 20 }]}>
                  Positions are a visual layout, not social distance. Only
                  returned relationships are drawn.
                </Text>
              </ScrollView>
            </LinearGradient>
          </View>
        </Modal>
      )}
    </>
  );
}
const s = StyleSheet.create({
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 5,
    marginTop: 5,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  tiny: { color: "#9b90ad", fontSize: 9, lineHeight: 15 },
  nodeList: { gap: 8, paddingVertical: 17 },
  nodePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#3d344c",
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#1d1b29",
  },
  nodeLabel: { color: "#c5b9d8", fontSize: 10 },
  blank: {
    position: "absolute",
    top: "29%",
    left: 25,
    right: 25,
    alignItems: "center",
  },
  blankTitle: {
    fontSize: 20,
    color: "#e2d7f2",
    marginTop: 15,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  copy: { fontSize: 13, lineHeight: 22, color: "#b6a9c8", marginTop: 12 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#090912aa",
  },
  sheet: {
    maxHeight: "87%",
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    padding: 25,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: "#4a3b58",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
    gap: 10,
  },
  eyebrow: { fontSize: 8, letterSpacing: 1.7, color: "#b9a5d2", flexShrink: 1 },
  close: { padding: 9, backgroundColor: "#3e304b", borderRadius: 24 },
  largeIcon: {
    width: 67,
    height: 67,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  detailTitle: {
    color: "#f1e8fb",
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: -1,
    fontWeight: "400",
    marginTop: 20,
  },
  provenance: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
    backgroundColor: "#202b2b",
    padding: 13,
    borderRadius: 17,
    marginTop: 18,
  },
  provenanceText: { fontSize: 10, lineHeight: 17, color: "#afc8bc", flex: 1 },
  related: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 15,
    borderTopWidth: 1,
    borderColor: "#3b3148",
  },
  relation: { color: "#a494b8", fontSize: 9 },
  relatedTitle: { color: "#ded0ed", fontSize: 14, marginTop: 5 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#c6acee",
    marginTop: 20,
  },
  primaryText: { fontSize: 13, fontWeight: "600", color: "#2c2141" },
});
