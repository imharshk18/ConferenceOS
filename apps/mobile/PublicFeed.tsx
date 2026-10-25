import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path } from "react-native-svg";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Reveal } from "./OrbitHome";
export function PublicFeed({
  authenticated,
  connected,
}: {
  authenticated: boolean;
  connected: boolean;
}) {
  const data = useQuery(api.opportunities.mine, authenticated ? {} : "skip");
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={s.row}>
        <Text style={s.eyebrow}>DISCOVERIES</Text>
        <Text style={s.meta}>Public posts · LinkedIn & X</Text>
      </View>
      <Text style={s.intro}>
        {data?.personalized
          ? "Fresh perspectives for your next chapter."
          : "Ideas and opportunities beyond your circle."}
      </Text>
      <Text style={s.fine}>Public discoveries, not people you’ve met.</Text>
      {data?.posts.map((p, i) => {
        const open = expanded === p.id,
          accent = ["#b3e3ce", "#e5bb91", "#b7b5ed"][i % 3],
          initials = p.author
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .slice(0, 2)
            .join("");
        return (
          <Reveal key={p.id} delay={Math.min(i, 4) * 60}>
            <View style={s.post}>
              <View style={s.row}>
                <View style={[s.avatar, { backgroundColor: accent + "18" }]}>
                  <Text style={[s.initials, { color: accent }]}>
                    {initials}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{p.author}</Text>
                  <Text style={s.fine}>
                    {p.platform === "x" ? "X" : "LinkedIn"} · public post
                  </Text>
                </View>
                <Ionicons
                  name={p.platform === "x" ? "logo-twitter" : "logo-linkedin"}
                  color="#929eae"
                  size={18}
                />
              </View>
              <Text style={s.quote}>{p.excerpt}</Text>
              <LinearGradient
                colors={
                  i % 3 === 0
                    ? ["#172d2c", "#142126"]
                    : i % 3 === 1
                      ? ["#332a23", "#202027"]
                      : ["#29283e", "#18232c"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.editorial}
              >
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Svg width="100%" height="100%" viewBox="0 0 350 200">
                    {i % 3 === 1
                      ? [0, 1, 2, 3, 4].map((n) => (
                          <Path
                            key={n}
                            d={`M${190 + n * 25} -15 Q${130 + n * 20} 100 ${220 + n * 30} 220`}
                            stroke={accent}
                            strokeWidth={1.2}
                            opacity={0.13 + n * 0.025}
                            fill="none"
                          />
                        ))
                      : [0, 1, 2, 3].map((n) => (
                          <Circle
                            key={n}
                            cx={285 - n * 10}
                            cy={48 + n * 12}
                            r={45 + n * 27}
                            fill="none"
                            stroke={accent}
                            strokeWidth={1}
                            opacity={0.18 - n * 0.025}
                          />
                        ))}
                  </Svg>
                </View>
                <Text style={[s.eyebrow, { color: accent }]}>
                  IN THE SPOTLIGHT
                </Text>
                <Text style={s.summary}>{p.summary}</Text>
                <Text style={s.artLabel}>
                  Editorial illustration · not source media
                </Text>
              </LinearGradient>
              <View style={[s.row, { marginTop: 15 }]}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Read original post by ${p.author}`}
                  onPress={() => void Linking.openURL(p.url)}
                  style={s.read}
                >
                  <Text style={s.readText}>Read original ↗</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Why this post by ${p.author}`}
                  accessibilityState={{ expanded: open }}
                  onPress={() => setExpanded(open ? null : p.id)}
                  style={s.detailButton}
                >
                  <Text style={s.detailText}>
                    {open ? "Less" : "Why this?"}
                  </Text>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#a6a9bb"
                  />
                </Pressable>
              </View>
              <Text style={s.fine}>
                {p.provider === "brightdata"
                  ? "Bright Data import"
                  : "Public-web source · import pending"}
                {!connected ? " · offline snapshot" : ""} · availability
                unverified
              </Text>
              {open && (
                <View style={s.details}>
                  <Text style={s.eyebrow}>WHY IT CAUGHT OUR EYE</Text>
                  <Text style={s.copy}>{p.reason}</Text>
                  <Text style={s.eyebrow}>A POSSIBLE NEXT MOVE</Text>
                  <Text style={s.copy}>{p.action}</Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Open public profile of ${p.author}`}
                    onPress={() => void Linking.openURL(p.profileUrl)}
                  >
                    <Text style={[s.readText, { marginVertical: 10 }]}>
                      View public profile ↗
                    </Text>
                  </Pressable>
                  <Text style={s.fine}>
                    Checked {p.fetchedAt}. {p.availability} · attendance not
                    verified.
                  </Text>
                </View>
              )}
            </View>
          </Reveal>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    justifyContent: "space-between",
  },
  eyebrow: { fontSize: 9, letterSpacing: 1.7, color: "#b6c4c6" },
  meta: { fontSize: 10, color: "#8c94a5" },
  intro: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "400",
    letterSpacing: -0.4,
    color: "#d9deea",
    marginTop: 15,
  },
  fine: { fontSize: 10, lineHeight: 17, color: "#828d9f", marginTop: 5 },
  post: { paddingVertical: 24, borderBottomWidth: 1, borderColor: "#ffffff13" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 14, fontWeight: "500", letterSpacing: 0.5 },
  name: { fontSize: 14, fontWeight: "500", color: "#e7eaf1" },
  quote: {
    fontSize: 14,
    lineHeight: 23,
    color: "#cbd0df",
    marginTop: 18,
    marginBottom: 16,
  },
  editorial: {
    padding: 20,
    borderRadius: 14,
    minHeight: 180,
    overflow: "hidden",
    justifyContent: "center",
  },
  summary: {
    fontSize: 23,
    lineHeight: 29,
    letterSpacing: -0.75,
    fontWeight: "400",
    color: "#edf0ed",
    marginTop: 14,
    marginBottom: 19,
  },
  artLabel: { fontSize: 8, color: "#8e9d9f" },
  read: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingVertical: 9,
  },
  readText: { fontSize: 12, fontWeight: "500", color: "#b8dccc" },
  detailButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    paddingLeft: 10,
  },
  detailText: { fontSize: 11, color: "#a6a9bb" },
  details: {
    marginTop: 15,
    paddingTop: 17,
    borderTopWidth: 1,
    borderColor: "#ffffff0d",
  },
  copy: {
    fontSize: 13,
    lineHeight: 21,
    color: "#b1b8c8",
    marginTop: 7,
    marginBottom: 15,
  },
});
