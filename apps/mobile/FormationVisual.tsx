import React, { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { useReducedMotion } from "./useReducedMotion";

type Point = { x: number; y: number; z: number };
/** Decorative waiting-state geometry: not a graph, percentage, or measured progress. */
export function FormationVisual({
  size,
  phase,
}: {
  size: number;
  phase: "calling" | "processing" | "connecting";
}) {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let foreground = AppState.currentState === "active";
    const listener = AppState.addEventListener("change", (state) => {
      foreground = state === "active";
    });
    if (reduced) {
      setElapsed(0);
      return () => listener.remove();
    }
    let handle = 0,
      previous = 0;
    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      if (now - previous < 1000 / 30) return;
      const delta = Math.min(60, previous ? now - previous : 0);
      previous = now;
      if (foreground) setElapsed((value) => value + delta);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      listener.remove();
    };
  }, [reduced]);
  const time = elapsed / 1000;
  const yaw = time * 0.15 + 0.3,
    tilt = -0.26 + Math.sin(time * 0.3) * 0.09;
  const project = (p: Point) => {
    const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
    const z0 = p.z * Math.cos(yaw) - p.x * Math.sin(yaw);
    const y = p.y * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = p.y * Math.sin(tilt) + z0 * Math.cos(tilt);
    const perspective = 3 / (3 - z * 0.3);
    return {
      x: size * 0.5 + x * size * 0.34 * perspective,
      y: size * 0.5 + y * size * 0.34 * perspective,
      z,
    };
  };
  const point = (strand: number, t: number): Point => {
    const a = t * Math.PI * 2,
      inclination = strand * 0.57 + 0.3;
    const breathe = 1 + Math.sin(time * 0.65 + strand) * 0.035;
    return {
      x: Math.cos(a) * breathe,
      y: Math.sin(a) * Math.cos(inclination) * breathe,
      z: Math.sin(a) * Math.sin(inclination) * breathe,
    };
  };
  const strands = Array.from({ length: 6 }, (_, index) => {
    const head =
      (time * (phase === "connecting" ? 0.105 : 0.075) + index * 0.17) % 1;
    const points = Array.from({ length: 85 }, (_, i) =>
      project(point(index, i / 84)),
    );
    const tail = Array.from({ length: 15 }, (_, i) =>
      project(point(index, head - (14 - i) * 0.004)),
    );
    const dot = project(point(index, head));
    return {
      index,
      points,
      tail,
      dot,
      color: index % 2 ? "#b8a7ee" : "#a2ead2",
    };
  }).sort((a, b) => a.dot.z - b.dot.z);
  const path = (points: Point[]) =>
    points
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  return (
    <View
      testID="formation-visual"
      accessibilityRole="image"
      accessibilityLabel={`${phase === "calling" ? "Waiting for your conversation" : phase === "processing" ? "Preparing your context" : "Connecting your context"}. Decorative animation; no progress estimate.`}
      style={{ width: size, height: size, alignSelf: "center" }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="formationGlow" cx="48%" cy="45%" r="50%">
            <Stop offset="0" stopColor="#aca0dc" stopOpacity=".19" />
            <Stop offset=".65" stopColor="#7baea8" stopOpacity=".06" />
            <Stop offset="1" stopColor="#141724" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="formationCore">
            <Stop offset="0" stopColor="#d0fbea" stopOpacity=".65" />
            <Stop offset=".25" stopColor="#b0e2da" stopOpacity=".16" />
            <Stop offset="1" stopColor="#bba6ef" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.49}
          fill="url(#formationGlow)"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.19}
          fill="url(#formationCore)"
          opacity={0.75 + Math.sin(time * 0.8) * 0.15}
        />
        {strands.map(({ index, points, tail, dot, color }) => (
          <React.Fragment key={index}>
            <Path
              d={path(points)}
              fill="none"
              stroke={color}
              strokeWidth={0.65}
              opacity={0.15}
            />
            <Path
              d={path(tail)}
              fill="none"
              stroke={color}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.35 + Math.max(0, dot.z) * 0.3}
            />
            <Circle
              cx={dot.x}
              cy={dot.y}
              r={5 + Math.max(0, dot.z) * 2}
              fill={color}
              opacity=".09"
            />
            <Circle
              testID="formation-light"
              cx={dot.x}
              cy={dot.y}
              r={1.4 + Math.max(0, dot.z) * 0.8}
              fill={color}
              opacity={0.5 + Math.max(0, dot.z) * 0.45}
            />
          </React.Fragment>
        ))}
        {Array.from({ length: 13 }, (_, i) => {
          const a = i * 2.39996,
            r = 0.25 + ((i * 7) % 9) / 13;
          const p = project({
            x: Math.cos(a) * r,
            y: Math.sin(a) * r * 0.85,
            z: Math.sin(i * 1.3) * 0.65,
          });
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={0.8}
              fill="#d0c7e9"
              opacity={0.15 + (p.z + 1) * 0.13}
            />
          );
        })}
      </Svg>
    </View>
  );
}
