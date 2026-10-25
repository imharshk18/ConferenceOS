import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { topics } from "../../packages/core/data";

export type PresentationSession = FunctionReturnType<
  typeof api.presentation.mine
>;
const C = {
  ink: "#e9e1f6",
  muted: "#a59cb7",
  bg: "#151520",
  line: "#393048",
  lime: "#baa1ee",
};
const terminal = (session: PresentationSession | undefined, now: number) =>
  !!session &&
  (session.status === "revoked" ||
    session.status === "expired" ||
    session.expiresAt <= now);
function statusLabel(
  session: PresentationSession | undefined,
  connected: boolean,
  now: number,
) {
  if (session === undefined)
    return connected ? "Checking presentation status" : "Disconnected";
  if (session?.status === "revoked") return "Revoked · sharing stopped";
  if (session && (session.status === "expired" || session.expiresAt <= now))
    return "Expired · sharing stopped";
  if (!connected) return "Disconnected";
  if (!session) return "Not paired";
  if (!session.approvedTopicIds.length) return "Paired · sharing paused";
  if (session.status === "live") return "Sharing approved public path";
  if (session.status === "loading") return "Preparing public path";
  if (session.status === "error") return "Public path unavailable";
  return "Paired · no matching public path";
}
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function PresentationSummary({
  session,
  connected,
  onOpen,
}: {
  session: PresentationSession | undefined;
  connected: boolean;
  onOpen: () => void;
}) {
  const now = useNow();
  return (
    <Pressable
      style={s.summary}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Manage desktop presentation sharing"
    >
      <View style={s.summaryIcon}>
        <Ionicons name="laptop-outline" size={22} color={C.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.summaryTitle}>Present a public path.</Text>
        <Text style={s.summarySub}>{statusLabel(session, connected, now)}</Text>
        <Text style={s.summaryFoot}>Only topics you explicitly approve.</Text>
      </View>
      <Ionicons name="arrow-forward" size={19} color={C.ink} />
    </Pressable>
  );
}

export function PresentationConsent({
  session,
  connected,
  onNotify,
  onRetry,
}: {
  session: PresentationSession | undefined;
  connected: boolean;
  onNotify: (message: string) => void;
  onRetry: () => void;
}) {
  const [code, setCode] = useState("");
  const [approved, setApproved] = useState<string[]>(
    session && !terminal(session, Date.now()) ? session.approvedTopicIds : [],
  );
  const [busy, setBusy] = useState<"pair" | "consent" | "revoke" | null>(null);
  const [error, setError] = useState("");
  const now = useNow();
  const sessionScopeInitialized = useRef<string | null>(null);
  useEffect(() => {
    if (session) {
      const ended = terminal(session, now);
      const key = `${session.sessionId}:${ended ? "ended" : "active"}`;
      if (sessionScopeInitialized.current !== key) {
        sessionScopeInitialized.current = key;
        setApproved(ended ? [] : session.approvedTopicIds);
      }
    }
  }, [session, now]);
  const pair = useMutation(api.presentation.pair);
  const updateConsent = useMutation(api.presentation.updateConsent);
  const revoke = useMutation(api.presentation.revoke);
  const active = !!session && !terminal(session, now);
  const unavailable = !connected || !!busy;
  const expiry = session
    ? new Date(session.expiresAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  if (session === undefined)
    return (
      <View style={{ paddingVertical: 18 }}>
        {connected && <ActivityIndicator color={C.ink} />}
        <Text style={[s.description, { marginTop: 14 }]}>
          {connected
            ? "Checking the current presentation before showing approval controls…"
            : "Presentation status is unavailable while disconnected. A previous approval may remain active until expiry. Reconnect to manage sharing."}
        </Text>
      </View>
    );
  const checkConnection = () => {
    if (connected) return true;
    setError(
      "Reconnect before changing sharing. A previous approval may stay active until its expiry.",
    );
    return false;
  };
  const share = async () => {
    if (!checkConnection()) return;
    setError("");
    setBusy(active ? "consent" : "pair");
    try {
      if (active && session) {
        await updateConsent({
          sessionId: session.sessionId,
          approvedTopicIds: approved,
        });
        onNotify(
          approved.length
            ? "Desktop approval updated"
            : "Public sharing paused",
        );
      } else {
        const result = await pair({ code, approvedTopicIds: approved });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCode("");
        onNotify("Paired with your approved topic scope");
      }
    } catch {
      setError("Could not update this presentation. Reconnect and try again.");
    } finally {
      setBusy(null);
    }
  };
  const pause = async () => {
    if (!session || !checkConnection()) return;
    setError("");
    setBusy("consent");
    try {
      await updateConsent({
        sessionId: session.sessionId,
        approvedTopicIds: [],
      });
      setApproved([]);
      onNotify("Public sharing paused");
    } catch {
      setError("Could not pause sharing. Reconnect and try again.");
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    if (!session || !checkConnection()) return;
    setError("");
    setBusy("revoke");
    try {
      await revoke({ sessionId: session.sessionId });
      onNotify("Desktop sharing revoked");
    } catch {
      setError("Could not revoke sharing. Reconnect and try again.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <View>
      <View style={s.status}>
        <View
          style={[
            s.dot,
            {
              backgroundColor:
                connected &&
                session?.status === "live" &&
                !terminal(session, now)
                  ? "#75a54a"
                  : "#af9b66",
            },
          ]}
        />
        <Text style={s.statusText}>{statusLabel(session, connected, now)}</Text>
        {session && <Text style={s.expiry}>Ends {expiry}</Text>}
      </View>
      {!connected && (
        <Text style={s.warning}>
          This phone is disconnected. A previously approved path may remain on
          the desktop until expiry. Reconnect to change approval or revoke
          access.
        </Text>
      )}
      <Text style={s.description}>
        Only selected topics and official topic → session → speaker paths are
        shared. Your profile name, contacts, meetings, and people paths are not
        shared.
      </Text>
      {!active && (
        <>
          <Text style={s.label}>DESKTOP PAIRING CODE</Text>
          <TextInput
            accessibilityLabel="Desktop pairing code"
            style={s.code}
            value={code}
            onChangeText={(value) =>
              setCode(value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            placeholderTextColor="#b5bda9"
            keyboardType="number-pad"
            autoComplete="off"
            maxLength={6}
          />
          <Text style={s.hint}>
            Create a code in the desktop presentation view. Codes expire after 5
            minutes; presentations last up to 30 minutes.
          </Text>
        </>
      )}
      <Text style={[s.label, { marginTop: 20, marginBottom: 11 }]}>
        APPROVE PUBLIC TOPICS
      </Text>
      <View style={s.topics}>
        {topics.map((topic) => {
          const checked = approved.includes(topic.id);
          return (
            <Pressable
              key={topic.id}
              accessibilityRole="checkbox"
              accessibilityLabel={`Share ${topic.name}`}
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() =>
                setApproved((ids) =>
                  checked
                    ? ids.filter((id) => id !== topic.id)
                    : [...ids, topic.id],
                )
              }
              style={[
                s.topic,
                checked && {
                  backgroundColor: topic.color,
                  borderColor: topic.color,
                },
              ]}
            >
              <View
                style={[
                  s.check,
                  checked && {
                    backgroundColor: "#473353",
                    borderColor: "#473353",
                  },
                ]}
              >
                {checked && (
                  <Ionicons name="checkmark" color="white" size={12} />
                )}
              </View>
              <Text style={[s.topicLabel, checked && { color: "#30243b" }]}>
                {topic.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.hint}>
        Checkbox changes take effect only after you tap the approval button.{" "}
        While this presentation is active, changing your private interests can
        refresh paths within this approved scope. An approved topic outside your
        interests does not produce a path.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          active
            ? approved.length
              ? "Update approved topics"
              : "Pause public sharing"
            : "Share approved topics"
        }
        disabled={
          unavailable || (!active && (code.length !== 6 || !approved.length))
        }
        accessibilityState={{
          disabled:
            unavailable || (!active && (code.length !== 6 || !approved.length)),
        }}
        style={[
          s.action,
          (unavailable ||
            (!active && (code.length !== 6 || !approved.length))) && {
            opacity: 0.45,
          },
        ]}
        onPress={() => void share()}
      >
        <Text style={s.actionText}>
          {active
            ? approved.length
              ? "Update approved topics"
              : "Pause public sharing"
            : "Share approved topics"}
        </Text>
        {busy === "pair" || busy === "consent" ? (
          <ActivityIndicator color={C.ink} size="small" />
        ) : (
          <Ionicons name="arrow-forward" size={20} color={C.ink} />
        )}
      </Pressable>
      {active && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear approval and pause sharing"
            disabled={unavailable || !session?.approvedTopicIds.length}
            onPress={() => void pause()}
            style={s.secondary}
          >
            <Ionicons name="pause-outline" size={18} color={C.ink} />
            <Text style={s.secondaryText}>
              Clear approval and pause sharing
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revoke presentation sharing"
            disabled={unavailable}
            onPress={() => void stop()}
            style={[s.revoke, unavailable && { opacity: 0.5 }]}
          >
            <Ionicons name="close-circle-outline" size={19} color={C.ink} />
            <Text style={s.actionText}>
              {busy === "revoke" ? "Revoking access…" : "Revoke desktop access"}
            </Text>
          </Pressable>
        </>
      )}
      {active && session?.status === "error" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry public path"
          disabled={unavailable}
          onPress={onRetry}
          style={s.secondary}
        >
          <Ionicons name="refresh-outline" size={18} color={C.ink} />
          <Text style={s.secondaryText}>Retry public path</Text>
        </Pressable>
      )}
      <Text style={s.foot}>
        Approval applies only to this presentation and expires automatically.
        Either device can revoke it.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  summary: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 21,
    padding: 16,
    backgroundColor: "#282334",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  summaryIcon: {
    height: 37,
    width: 37,
    borderRadius: 13,
    backgroundColor: "#282334",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: { fontSize: 13, color: C.ink, fontWeight: "500" },
  summarySub: { color: "#b3a6c3", fontSize: 9, marginTop: 5 },
  summaryFoot: { color: "#b3a6c3", fontSize: 8, marginTop: 4 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#282334",
    padding: 12,
    borderRadius: 12,
    marginBottom: 17,
    flexWrap: "wrap",
  },
  dot: { height: 5, width: 5, borderRadius: 3 },
  statusText: { fontSize: 10, color: C.ink, fontWeight: "500" },
  expiry: { fontSize: 9, color: "#b3a6c3", marginLeft: "auto" },
  description: {
    color: "#b3a6c3",
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 8,
    color: "#b3a6c3",
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  code: {
    fontSize: 28,
    fontWeight: "500",
    letterSpacing: 10,
    backgroundColor: "#282334",
    color: C.ink,
    borderRadius: 16,
    paddingHorizontal: 18,
    height: 59,
    marginTop: 10,
  },
  hint: {
    fontSize: 10,
    color: "#b3a6c3",
    lineHeight: 17,
    marginTop: 10,
    marginBottom: 13,
  },
  topics: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  topic: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    padding: 12,
    backgroundColor: "#282334",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 13,
    width: "48%",
  },
  topicLabel: { fontSize: 10, color: C.ink, flexShrink: 1 },
  check: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c4d1b7",
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    backgroundColor: C.lime,
    height: 49,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 7,
  },
  actionText: { color: "#241b31", fontSize: 12, fontWeight: "600" },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 19,
  },
  secondaryText: { fontSize: 10, color: "#b3a6c3" },
  revoke: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 47,
    borderWidth: 1,
    borderColor: "#cfdac1",
    borderRadius: 15,
  },
  foot: {
    color: "#b3a6c3",
    fontSize: 9,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 17,
    marginBottom: 7,
  },
  error: {
    color: "#b3a6c3",
    backgroundColor: "#282334",
    borderRadius: 12,
    padding: 12,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 12,
  },
  warning: {
    fontSize: 11,
    lineHeight: 18,
    backgroundColor: "#282334",
    color: "#b3a6c3",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
});
