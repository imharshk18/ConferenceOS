import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { publicKinds, orderedProofEdges } from "./PresentationPanel";
import type { GraphProof } from "../../../packages/core/intelligence";
import { isRedactedSocialProof } from "../../../packages/core/social";
import { validSharedContextGraph, type SharedContextGraph } from "../../../packages/core/network";
export type { GraphProof } from "../../../packages/core/intelligence";

export type GraphNode = { id: string; kind: string; label: string };
export type GraphLink = { source: string; target: string; kind: string };
const colors: Record<string, string> = {
  Talk: "#91f5dc",
  Speaker: "#c5a4ff",
  Topic: "#fa9cdd",
  Room: "#8bbfff",
  SharedPerson: "#c8acff",
  SharedTopic: "#88f4d4",
  SharedMemory: "#ffb9de",
  SharedSignal: "#a1d4ff",
  SharedSelf: "#ffffff",
  SharedLearning: "#91f5dc",
  SharedGoal: "#aabaff",
};
function position(i: number, n: number, r = 2.05) {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / n),
    theta = Math.PI * (1 + Math.sqrt(5)) * i;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}
function contextPosition(id: string) {
  // Stable session aliases keep existing nodes still as new context arrives.
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const z = ((hash >>> 0) / 4294967296) * 1.8 - .9;
  const angle = (((Math.imul(hash, 2246822519) >>> 0) / 4294967296) * Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(Math.cos(angle) * r * 2.1, z * 2.1, Math.sin(angle) * r * 2.1);
}
/** Draws only returned relationships. Ambient sphere particles are decoration, not data. */
function ContextWeave({ links, major, reducedMotion, playing, color='#adffe7' }: { links: GraphLink[]; major: Map<string, THREE.Vector3>; reducedMotion: boolean; playing: boolean; color?:string }) {
  const seen = useRef(new Set<string>()), geometry = useRef<THREE.BufferGeometry>(null), spark = useRef<THREE.Mesh>(null), elapsed = useRef(0);
  const data = useMemo(() => {
    const old: number[] = [], fresh: number[] = [];
    for (const link of links) {
      const key = `${link.source}|${link.kind}|${link.target}`, a = major.get(link.source), b = major.get(link.target);
      if (!a || !b) continue;
      const path = new THREE.QuadraticBezierCurve3(a, a.clone().add(b).normalize().multiplyScalar(2.7), b).getPoints(24);
      const target = seen.current.has(key) ? old : fresh;
      for (let i = 0; i < 24; i++) target.push(...path[i].toArray(), ...path[i + 1].toArray());
    }
    return { positions: new Float32Array([...old, ...fresh]), existing: old.length / 3, added: fresh.length / 3 };
  }, [links, major]);
  useEffect(() => { elapsed.current = 0; if (links.length) seen.current = new Set(links.map(l => `${l.source}|${l.kind}|${l.target}`)); }, [links]);
  useFrame((_, delta) => {
    if (playing) elapsed.current += delta;
    const t = reducedMotion ? 1 : Math.min(1, elapsed.current / 3.8);
    const count = data.existing + Math.floor(data.added * (1 - Math.pow(1 - t, 2)) / 2) * 2;
    geometry.current?.setDrawRange(0, count);
    if (spark.current) { spark.current.visible = t < 1 && count >= 2; if (count >= 2) spark.current.position.fromArray(data.positions, (count - 1) * 3); }
  });
  return <>
    <lineSegments renderOrder={4}><bufferGeometry ref={geometry}><bufferAttribute attach="attributes-position" args={[data.positions, 3]} /></bufferGeometry><lineBasicMaterial color={color} transparent opacity={.7} depthTest={false} depthWrite={false} /></lineSegments>
    <mesh ref={spark} renderOrder={6}><sphereGeometry args={[.045, 12, 12]} /><meshBasicMaterial color="#eafff8" depthTest={false} /></mesh>
  </>;
}
type SceneProps = {
  nodes: GraphNode[];
  links: GraphLink[];
  selected: string[];
  proof: GraphProof | null;
  animationKey: string | number;
  onSelect?: (n: GraphNode) => void;
  playing: boolean;
  onProofComplete?: () => void;
  context?: boolean;
  focusLinks?:GraphLink[];
  focusColor?:string;
};
function Sphere({
  nodes,
  links,
  selected,
  proof,
  animationKey,
  onSelect,
  playing,
  onProofComplete,
  context = false,
  focusLinks=[],focusColor='#a4ffe1',
}: SceneProps) {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState<string | null>(null),
    [progress, setProgress] = useState(0);
  const progressRef = useRef(0),
    completed = useRef(false),
    callback = useRef(onProofComplete);
  callback.current = onProofComplete;
  const drag = useRef<{ x: number; y: number } | null>(null);
  const ordered = useMemo(() => orderedProofEdges(proof), [proof]);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  useEffect(() => {
    progressRef.current = 0;
    completed.current = false;
    setProgress(reducedMotion ? ordered.length * 16 : 0);
  }, [animationKey, proof, ordered.length, reducedMotion]);
  const scene = useMemo(() => {
    const pts = Array.from({ length: 420 }, (_, i) => position(i, 420));
    const small = new Float32Array(pts.flatMap((p) => p.toArray()));
    const web: number[] = [];
    pts.forEach((p, i) => {
      [i + 13, i + 21].forEach((j) => {
        if (j < pts.length && p.distanceTo(pts[j]) < 0.65)
          web.push(...p.toArray(), ...pts[j].toArray());
      });
    });
    const allNodes = [...nodes];
    for (const node of proof?.nodes ?? [])
      if (
        (publicKinds.has(node.kind) || isRedactedSocialProof(proof!)) &&
        !allNodes.some((n) => n.id === node.id)
      )
        allNodes.push(node);
    const major = new Map(
      allNodes.map((n, i) => [n.id, context ? contextPosition(n.id) : position(i, allNodes.length, 2.1)]),
    );
    const curve = (from: string, to: string) => {
      const a = major.get(from),
        b = major.get(to);
      return a && b
        ? new THREE.QuadraticBezierCurve3(
            a,
            a.clone().add(b).normalize().multiplyScalar(2.5),
            b,
          ).getPoints(16)
        : null;
    };
    const edge: number[] = [];
    (context ? [] : links).forEach((l) => {
      const a = major.get(l.source),
        b = major.get(l.target);
      if (!a || !b) return;
      const path = new THREE.QuadraticBezierCurve3(
        a,
        a.clone().add(b).normalize().multiplyScalar(2.5),
        b,
      ).getPoints(16);
      for (let i = 0; i < path.length - 1; i++)
        edge.push(...path[i].toArray(), ...path[i + 1].toArray());
    });
    return {
      small,
      web: new Float32Array(web),
      major,
      edge: new Float32Array(edge),
      paths: ordered.map((step) => curve(step.from, step.to)),
      allNodes,
    };
  }, [nodes, links, proof, ordered, context]);
  const highlight = useMemo(() => {
    const segments: number[] = [];
    scene.paths.forEach((path, step) => {
      if (path)
        for (
          let i = 0;
          i < Math.min(16, Math.max(0, progress - step * 16));
          i++
        )
          segments.push(...path[i].toArray(), ...path[i + 1].toArray());
    });
    return new Float32Array(segments);
  }, [scene, progress]);
  const highlightedNodes = ordered.length
    ? proof!.traversalNodeIds.slice(
        0,
        Math.min(proof!.traversalNodeIds.length, Math.floor(progress / 16) + 1),
      )
    : selected;
  useFrame((state, delta) => {
    if (group.current && !drag.current && playing && !reducedMotion)
      group.current.rotation.y += delta * 0.055;
    if (group.current && !reducedMotion)
      group.current.rotation.z =
        Math.sin(state.clock.elapsedTime * 0.15) * 0.025;
    if (ordered.length && !completed.current) {
      progressRef.current = Math.min(
        ordered.length * 16,
        progressRef.current + delta * 20,
      );
      const next = reducedMotion
        ? ordered.length * 16
        : Math.floor(progressRef.current);
      if (next !== progress) setProgress(next);
      if (next === ordered.length * 16) {
        completed.current = true;
        callback.current?.();
      }
    }
  });
  function down(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY };
    e.target && (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function move(e: ThreeEvent<PointerEvent>) {
    if (drag.current && group.current) {
      group.current.rotation.y += (e.clientX - drag.current.x) * 0.009;
      group.current.rotation.x += (e.clientY - drag.current.y) * 0.006;
      drag.current = { x: e.clientX, y: e.clientY };
    }
  }
  return (
    <group
      ref={group}
      rotation={[0.17, 0.3, 0]}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <mesh>
        <sphereGeometry args={[1.99, 48, 48]} />
        <meshBasicMaterial color="#111126" transparent opacity={0.88} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2, 28, 18]} />
        <meshBasicMaterial
          color="#9b7cd0"
          wireframe
          transparent
          opacity={0.09}
        />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[scene.small, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#d5b6ff"
          size={0.019}
          transparent
          opacity={0.65}
          sizeAttenuation
        />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[scene.web, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#c197ec" transparent opacity={0.16} />
      </lineSegments>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[scene.edge, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#b394dc" transparent opacity={selected.length?0.025:0.18} />
      </lineSegments>
      <lineSegments renderOrder={5}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[highlight, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#a4ffe1"
          transparent
          opacity={1}
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {context && <ContextWeave links={links} major={scene.major} reducedMotion={reducedMotion} playing={playing} />}
      {!context&&focusLinks.length>0&&<ContextWeave key={focusColor} links={focusLinks} major={scene.major} reducedMotion={reducedMotion} playing={playing} color={focusColor}/>}
      {scene.allNodes.map((n) => (
        <group key={n.id} position={scene.major.get(n.id)}>
          <mesh
            renderOrder={context || highlightedNodes.includes(n.id) ? 6 : 0}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(n);
            }}
            onPointerOver={() => {
              setHover(n.id);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHover(null);
              document.body.style.cursor = "auto";
            }}
          >
            <sphereGeometry
              args={[
                highlightedNodes.includes(n.id)
                  ? 0.075
                  : hover === n.id
                    ? 0.065
                    : 0.042,
                12,
                12,
              ]}
            />
            <meshBasicMaterial
              depthTest={!context && !highlightedNodes.includes(n.id)}
              transparent opacity={selected.length&&!highlightedNodes.includes(n.id)?0.14:1}
              color={
                highlightedNodes.includes(n.id)
                  ? focusColor
                  : colors[n.kind] || "#c5a4ff"
              }
            />
          </mesh>
          <mesh>
            <sphereGeometry
              args={[highlightedNodes.includes(n.id) ? 0.14 : 0.085, 10, 10]}
            />
            <meshBasicMaterial
              color={colors[n.kind] || "#c5a4ff"}
              transparent
              opacity={highlightedNodes.includes(n.id) ? 0.18 : 0.07}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="globe-fallback">
        ✳<small>3D needs WebGL on this device</small>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function GraphScene({
  nodes = [],
  links = [],
  selected = [],
  proof = null,
  animationKey = "",
  onSelect,
  playing = true,
  onProofComplete,
  networkCount = 0,
  contextGraph = null,
  focusLinks=[],focusColor='#a4ffe1',
}: {
  nodes?: GraphNode[];
  links?: GraphLink[];
  selected?: string[];
  proof?: GraphProof | null;
  animationKey?: string | number;
  onSelect?: (n: GraphNode) => void;
  playing?: boolean;
  onProofComplete?: () => void;
  networkCount?: number;
  contextGraph?: SharedContextGraph | null;
  focusLinks?:GraphLink[];
  focusColor?:string;
}) {
  const context = useMemo(() => contextGraph && validSharedContextGraph(contextGraph) ? contextGraph : null, [contextGraph]);
  const safeNodes = useMemo(
    () => context ? context.nodes : [
      ...nodes.filter((node) => publicKinds.has(node.kind)),
      ...(networkCount > 0
        ? Array.from({ length: Math.min(20, networkCount) + 1 }, (_, i) => ({
            id: `network:${i}`,
            kind: "SharedPerson",
            label: i ? "A connection" : "You",
          }))
        : []),
    ],
    [nodes, networkCount, context],
  );
  const safeLinks = useMemo(() => {
    if (context) return context.edges;
    const ids = new Set(safeNodes.map((node) => node.id));
    return [
      ...links.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
      ...Array.from({ length: Math.min(20, networkCount) }, (_, i) => ({
        source: "network:0",
        target: `network:${i + 1}`,
        kind: "MET",
      })),
    ];
  }, [links, safeNodes, networkCount, context]);
  return (
    <CanvasBoundary>
      <Canvas
        camera={{ position: [0, 0, 6.2], fov: 46 }}
        dpr={[1, 1.6]}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ touchAction: "none" }}
        aria-label="Interactive 3D knowledge graph. Drag to rotate; returned paths illuminate in order."
      >
        <Sphere
          nodes={safeNodes}
          links={safeLinks}
          selected={selected}
          proof={proof}
          animationKey={animationKey}
          onSelect={onSelect}
          playing={playing}
          onProofComplete={onProofComplete}
          context={!!context}
          focusLinks={focusLinks} focusColor={focusColor}
        />
      </Canvas>
    </CanvasBoundary>
  );
}
