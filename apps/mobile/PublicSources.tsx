import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "./friendlyError";

export function PublicSources({
  connectionId,
  name,
  connected,
}: {
  connectionId: Id<"connections">;
  name: string;
  connected: boolean;
}) {
  const sources = useQuery(api.sources.mine, {});
  const add = useMutation(api.sources.add),
    refresh = useMutation(api.sources.refresh),
    check = useMutation(api.sources.check),
    remove = useMutation(api.sources.remove);
  const [url, setUrl] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setUrl("");
    setConfirmed(false);
    setError("");
  }, [connectionId]);
  async function run(task: () => Promise<unknown>) {
    if (!connected || busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        friendlyError(e, "Couldn’t update this source."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.panel}>
      <View style={s.row}>
        <Ionicons name="newspaper-outline" size={22} color="#c4b0e7" />
        <Text style={s.title}>A public window into their world.</Text>
      </View>
      <Text style={s.body}>
        Add {name}’s public LinkedIn or X profile URL. No sign-in, OAuth, or
        access to private posts.
      </Text>
      <TextInput
        value={url}
        onChangeText={(value) => {
          setUrl(value);
          setConfirmed(false);
        }}
        accessibilityLabel="Public profile URL"
        placeholder="https://www.linkedin.com/in/… or x.com/…"
        placeholderTextColor="#8d809d"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={s.input}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        aria-checked={confirmed}
        accessibilityLabel="Confirm public profile association"
        onPress={() => setConfirmed(!confirmed)}
        style={s.row}
      >
        <Ionicons
          name={confirmed ? "checkbox" : "square-outline"}
          size={21}
          color="#bea8e8"
        />
        <Text style={[s.body, { flex: 1 }]}>
          I believe this profile belongs to {name}. This association is not
          ownership-verified.
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add public profile source"
        disabled={!url.trim() || !confirmed || busy || !connected}
        style={[
          s.button,
          (!url.trim() || !confirmed || busy || !connected) && { opacity: 0.4 },
        ]}
        onPress={() =>
          void run(async () => {
            await add({ connectionId, profileUrl: url.trim(), confirmed });
            setUrl("");
            setConfirmed(false);
          })
        }
      >
        <Text style={s.buttonText}>Add public profile</Text>
      </Pressable>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {busy && <ActivityIndicator color="#c7b2ee" style={{ marginTop: 12 }} />}
      {(sources || [])
        .filter((source) => source.connectionId === connectionId)
        .map((source) => (
          <View key={source.id} style={s.source}>
            <View style={s.row}>
              <Ionicons
                name={
                  source.platform === "linkedin" ? "logo-linkedin" : "logo-x"
                }
                size={20}
                color="#c4b0e7"
              />
              <Text style={s.sourceTitle}>
                {source.platform === "linkedin" ? "LinkedIn" : "X"} ·{" "}
                {source.status}
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                void Linking.openURL(source.profileUrl).catch(() =>
                  setError("Couldn’t open the public profile."),
                )
              }
            >
              <Text numberOfLines={2} style={s.url}>
                {source.profileUrl}
              </Text>
            </Pressable>
            <Text style={s.fine}>
              {source.postCount} imported posts
              {source.lastCheckedAt
                ? ` · checked ${new Date(source.lastCheckedAt).toLocaleDateString()}`
                : " · not checked yet"}{" "}
              · association unverified
            </Text>
            {source.error && <Text style={s.error}>{source.error}</Text>}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Import public ${source.platform} posts`}
              disabled={
                busy ||
                !connected ||
                ["starting", "running", "uncertain"].includes(source.status)
              }
              onPress={() => void run(() => refresh({ sourceId: source.id }))}
              style={s.secondary}
            >
              <Text style={s.secondaryText}>Import up to 3 public posts</Text>
            </Pressable>
            {["starting", "running", "uncertain", "error"].includes(
              source.status,
            ) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Check public import status"
                disabled={busy || !connected}
                onPress={() => void run(() => check({ sourceId: source.id }))}
                style={s.secondary}
              >
                <Text style={s.secondaryText}>Check existing import</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${source.platform} source`}
              disabled={busy || !connected}
              onPress={() => void run(() => remove({ sourceId: source.id }))}
              style={s.secondary}
            >
              <Text style={s.secondaryText}>
                Remove source & its imported posts
              </Text>
            </Pressable>
          </View>
        ))}
      <Text style={s.fine}>
        Import uses Bright Data account credits. Public availability varies; a
        private, unavailable, or empty profile may return no posts. Removing a
        source retracts its posts from your private feed.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    padding: 19,
    borderWidth: 1,
    borderColor: "#393044",
    borderRadius: 24,
    backgroundColor: "#1d1a29",
    marginTop: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: "#eee2fa", fontSize: 18, fontWeight: "500", flex: 1 },
  body: { color: "#aea0bf", fontSize: 12, lineHeight: 19, marginTop: 9 },
  input: {
    padding: 14,
    marginVertical: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#3b2d49",
    backgroundColor: "#11101a",
    color: "#e6dcf2",
    fontSize: 12,
  },
  button: {
    padding: 14,
    marginTop: 16,
    borderRadius: 17,
    backgroundColor: "#cbb4f1",
    alignItems: "center",
  },
  buttonText: { color: "#2a1c3a", fontSize: 12, fontWeight: "600" },
  secondary: { paddingVertical: 10 },
  secondaryText: { color: "#bca6da", fontSize: 11 },
  source: {
    borderTopWidth: 1,
    borderColor: "#3b3049",
    marginTop: 20,
    paddingTop: 17,
  },
  sourceTitle: { color: "#e2d3f0", fontSize: 13, fontWeight: "500" },
  url: { color: "#b8a4d8", fontSize: 11, lineHeight: 18, marginTop: 9 },
  fine: { color: "#8d7f9f", fontSize: 9, lineHeight: 15, marginTop: 12 },
  error: { color: "#edb0c3", fontSize: 11, lineHeight: 18, marginTop: 12 },
});
