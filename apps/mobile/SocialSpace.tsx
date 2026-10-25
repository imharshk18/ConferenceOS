import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { topics } from "../../packages/core/data";
import { Portrait, Reveal } from "./OrbitHome";
import type { Id } from "../../convex/_generated/dataModel";
import type { GraphProof } from "../../packages/core/intelligence";
import { InvitationQR } from "./InvitationQR";
import { shareInvitationUrl } from "./inviteLink";
import { InviteScanner } from "./InviteScanner";
import { PublicSources } from "./PublicSources";
import { friendlyError } from "./friendlyError";
import { WrappedLauncher, NetworkPresentation } from "./NetworkExperience";
import { AreaPicker } from "./AreaPicker";
import { NETWORK_AREAS } from "../../packages/core/network";
import { VoiceOnboarding } from './VoiceOnboarding';
import { PublicFeed } from './PublicFeed';
import {
  CaptureCenter,
  CaptureStudio,
  type CaptureTarget,
} from "./CaptureStudio";

const colors = ["#bdacff", "#a2e7ce", "#f2b5ca", "#a4c7f5", "#e6e5a3"];
export function SocialSpace({
  mode,
  authenticated,
  connected,
  onNotify,
  initialConnectionId,
  pendingInviteCode,
  onOpenNetwork,
}: {
  mode: "network" | "feed";
  authenticated: boolean;
  connected: boolean;
  onNotify: (message: string) => void;
  initialConnectionId?: Id<"connections">;
  pendingInviteCode?: string;
  onOpenNetwork: () => void;
}) {
  const data = useQuery(api.social.mine, authenticated ? {} : "skip");
  const saveProfile = useMutation(api.social.saveProfile);
  const demoConnect = useMutation(api.demo.connect);
  const createInvite = useMutation(api.social.createInvite);
  const requestConnection = useMutation(api.social.requestConnection);
  const respondConnection = useMutation(api.social.respondConnection);
  const revokeConnection = useMutation(api.social.revokeConnection);
  const saveMemory = useMutation(api.social.saveMemory);
  const approveMemory = useMutation(api.social.approveMemory);
  const revokeMemory = useMutation(api.social.revokeMemory);
  const publishDemoPost = useMutation(api.social.publishDemoPost);
  const loadBrightDataDemo = useMutation(api.social.loadBrightDataDemo);
  const retryFeed = useMutation(api.social.retryFeed);
  const presentPath = useMutation(api.social.presentPath);
  const setStageSharing = useMutation(api.social.setStageSharing);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [headline, setHeadline] = useState(""),
    [goal, setGoal] = useState("");
  const [skills, setSkills] = useState<string[]>([]),
    [color, setColor] = useState(colors[0]);
  const [networkAreas, setNetworkAreas] = useState<string[]>([]);
  const [invite, setInvite] = useState<{
      code: string;
      expiresAt: number;
    } | null>(null),
    [code, setCode] = useState("");
  const [selected, setSelected] = useState<Id<"connections"> | null>(null),
    [note, setNote] = useState(""),
    [noteTopics, setNoteTopics] = useState<string[]>([]);
  const [noteAreas, setNoteAreas] = useState<string[]>([]);
  const [post, setPost] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const [editMemory, setEditMemory] = useState<{
    id: Id<"memories">;
    revision: number;
  } | null>(null);
  const [composer, setComposer] = useState(false),
    [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(
    null,
  );
  const [showDemo, setShowDemo] = useState(false);
  const [inviteOptions, setInviteOptions] = useState(false);
  useEffect(() => {
    if (pendingInviteCode) {
      setCode(pendingInviteCode);
      setInviteOptions(true);
    }
  }, [pendingInviteCode]);
  useEffect(() => {
    if (initialConnectionId) setSelected(initialConnectionId);
  }, [initialConnectionId]);
  async function run(task: () => Promise<unknown>, success?: string) {
    if (!authenticated || !connected) {
      setError("You’re offline. Reconnect to save this change.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      if (success) onNotify(success);
    } catch (err) {
      setError(
        friendlyError(err, "Couldn’t save that change. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }
  const beginProfile = () => {
    setName(data?.profile?.name || "");
    setHeadline(data?.profile?.headline || "");
    setGoal(data?.profile?.goal || "");
    setSkills(data?.profile?.skillIds || []);
    setNetworkAreas(
      data?.profile?.networkAreas || data?.profile?.skillIds || [],
    );
    setColor(data?.profile?.color || colors[0]);
    setEditing(true);
  };
  const accepted =
    data?.connections.filter((c) => c.status === "accepted") || [];
  const pending = data?.connections.filter((c) => c.status === "pending") || [];
  const person = data?.connections.find((c) => c.id === selected);
  return (
    <>
      {captureTarget && (
        <CaptureStudio
          target={captureTarget}
          connected={connected}
          onClose={() => setCaptureTarget(null)}
        />
      )}
      {scanning && (
        <InviteScanner
          onClose={() => setScanning(false)}
          onCode={(value) => {
            setCode(value);
            onNotify("Invite scanned · review the code and send a request");
          }}
        />
      )}
      <Reveal>
        <View style={s.headingRow}>
          <View>
            <Text style={s.eyebrow}>
              {mode === "network"
                ? "GOOD THINGS START WITH PEOPLE"
                : "A LITTLE CONTEXT. A BETTER HELLO."}
            </Text>
            <Text style={s.title}>
              {mode === "network" ? "Your people." : "For you."}
            </Text>
          </View>
          <View style={s.headingIcon}>
            <Ionicons
              name={mode === "network" ? "people-outline" : "sparkles-outline"}
              size={25}
              color="#c6b4ff"
            />
          </View>
        </View>
        <Text style={s.subtitle}>
          {mode === "network"
            ? "Remember the conversation. Grow the connection."
            : "Good conversations lead somewhere."}
        </Text>
      </Reveal>
      {mode === 'feed' && <PublicFeed authenticated={authenticated} connected={connected} />}
      {!connected && (
        <View style={s.notice}>
          <Ionicons name="cloud-offline-outline" size={18} color="#eac98c" />
          <Text style={s.noticeText}>
            Offline · showing saved data. Changes need a connection.
          </Text>
        </View>
      )}
      {!!error && (
        <View accessibilityRole="alert" style={s.error}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => setError("")}>
            <Ionicons name="close" size={18} color="#f6b3c0" />
          </Pressable>
        </View>
      )}
      {busy && (
        <ActivityIndicator color="#c6b4ff" style={{ marginVertical: 10 }} />
      )}
      {!data ? (
        <View style={s.empty}>
          <ActivityIndicator color="#c6b4ff" />
          <Text style={s.body}>
            {connected
              ? "Opening your private network…"
              : "Your network will appear when you reconnect."}
          </Text>
        </View>
      ) : editing ? (
        <Reveal>
          <LinearGradient colors={["#302941", "#1b222c"]} style={s.panel}>
            <Text style={s.cardTitle}>
              {editing ? "Make it yours." : "First, a little about you."}
            </Text>
            <Text style={s.body}>
              Your name and interests help your connections find common ground.
            </Text>
            <Field
              label="YOUR NAME"
              value={name}
              onChange={setName}
              placeholder="What should we call you?"
            />
            <Field
              label="WHAT YOU DO"
              value={headline}
              onChange={setHeadline}
              placeholder="Builder, founder, curious human…"
            />
            <Field
              label="WHAT BRINGS YOU HERE"
              value={goal}
              onChange={setGoal}
              placeholder="I’d love to meet people working on…"
              multiline
            />
            <Text style={s.fieldLabel}>THE WORLDS YOU MOVE IN</Text>
            <AreaPicker selected={networkAreas} onChange={setNetworkAreas} />
            <Text style={s.fine}>
              Self-declared context, not verified expertise. Pick only what
              feels true to you.
            </Text>
            <Text style={s.fieldLabel}>SESSION INTERESTS · OPTIONAL</Text>
            <TopicPicker
              selected={skills}
              onChange={setSkills}
              prefix="Session interest"
            />
            <View style={s.colorRow}>
              {colors.map((c) => (
                <Pressable
                  key={c}
                  accessibilityLabel={`Profile color ${c}`}
                  onPress={() => setColor(c)}
                  style={[
                    s.color,
                    { backgroundColor: c },
                    color === c && { borderColor: "#ffffff", borderWidth: 3 },
                  ]}
                />
              ))}
            </View>
            <Button
              label="Save my profile"
              icon="arrow-forward"
              disabled={!name.trim() || busy || !connected}
              onPress={() =>
                void run(async () => {
                  await saveProfile({
                    name: name.trim(),
                    headline: headline.trim(),
                    goal: goal.trim(),
                    skillIds: skills,
                    networkAreas,
                    color,
                  });
                  setEditing(false);
                }, "Profile saved")
              }
            />
            {editing && (
              <Button
                label="Cancel"
                secondary
                onPress={() => setEditing(false)}
              />
            )}
            <Text style={s.fine}>
              Shared only with people you connect with. Private notes stay
              private until both people approve.
            </Text>
          </LinearGradient>
        </Reveal>
      ) : !data.profile && mode === 'network' ? (
        <VoiceOnboarding connected={connected} onManual={beginProfile}/>
      ) : mode === "network" && data.profile ? (
        <>
          <Reveal delay={60}>
            <Pressable onPress={beginProfile} style={s.profile}>
              <Portrait
                node={{
                  id: "me",
                  name: data.profile.name,
                  color: data.profile.color,
                }}
                size={58}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{data.profile.name}</Text>
                <Text style={s.body}>
                  {data.profile.headline || "Open to possibility"}
                </Text>
              </View>
              <Ionicons name="create-outline" size={20} color="#a6a1b8" />
            </Pressable>
          </Reveal>
          <VoiceOnboarding connected={connected} hasProfile onManual={beginProfile}/>
          <Button label="Start a conversation" icon="mic-outline" disabled={!connected} onPress={()=>setCaptureTarget({kind:'conversation',title:'A good conversation',recordFirst:true})}/>
          <CaptureCenter
            connected={connected}
            goal={data.profile?.goal || ""}
          />
          <WrappedLauncher
            authenticated={authenticated}
            connected={connected}
          />
          <View style={s.section}>
            <Text style={s.sectionTitle}>Make a connection</Text>
            <Text style={s.count}>{accepted.length} IN YOUR ORBIT</Text>
          </View>
          <LinearGradient colors={["#262238", "#1d2630"]} style={s.panel}>
            <View style={s.inline}>
              <View style={s.iconTile}>
                <Ionicons name="link-outline" size={24} color="#c6b4ff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>A hello worth keeping.</Text>
                <Text style={s.body}>
                  Share a private invite. You still choose who joins your orbit.
                </Text>
              </View>
            </View>
            <Button
              label="Try tap-to-connect · demo code 123456"
              icon="radio-outline"
              disabled={busy || !connected}
              onPress={()=>{setCode('123456');setInviteOptions(true);}}
            />
            <Button
              label="Share an invite"
              icon="share-outline"
              disabled={busy || !connected}
              onPress={() =>
                void run(async () => {
                  const current =
                    invite && invite.expiresAt > Date.now()
                      ? invite
                      : await createInvite({});
                  setInvite(current);
                  try {
                    await Share.share({
                      message: `Let’s connect on ConferenceOS. Open this invite in the app, or paste it under More connection options. A request still needs acceptance.\n${shareInvitationUrl(current.code)}`,
                    });
                  } catch {
                    setInviteOptions(true);
                    onNotify(
                      "Sharing isn’t available here. Use the invite code or QR below.",
                    );
                  }
                })
              }
            />
            <Button
              label={
                inviteOptions
                  ? "Hide connection options"
                  : "More connection options"
              }
              secondary
              icon="ellipsis-horizontal"
              onPress={() => setInviteOptions((value) => !value)}
            />
            {inviteOptions && (
              <>
                {invite && (
                  <View style={s.codeBox}>
                    <InvitationQR
                      code={invite.code}
                      expiresAt={invite.expiresAt}
                    />
                    <Text selectable style={s.code}>
                      {invite.code}
                    </Text>
                    <Text style={s.fine}>
                      Expires{" "}
                      {new Date(invite.expiresAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · you approve each request
                    </Text>
                  </View>
                )}
                <Button
                  label={
                    invite ? "Get a fresh invite code" : "Create my invite code"
                  }
                  icon="add"
                  disabled={busy || !connected}
                  onPress={() =>
                    void run(async () => setInvite(await createInvite({})))
                  }
                />
                <View style={s.joinRow}>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    placeholder="Enter their code"
                    placeholderTextColor="#77748b"
                    autoCapitalize="characters"
                    accessibilityLabel="Connection invite code"
                    style={[s.input, { flex: 1, marginTop: 0 }]}
                  />
                  <Pressable
                    disabled={!code.trim() || busy || !connected}
                    accessibilityLabel="Send connection request"
                    onPress={() =>
                      void run(async () => {
                        if(code.trim()==='123456'){
                          const result=await demoConnect({code:code.trim()});setSelected(result.connectionId);setCode('');onNotify('Connected to Alex · simulated demo attendee');return;
                        }
                        const result = await requestConnection({
                          code: code.trim(),
                        });
                        if (!result.ok)
                          throw new Error(
                            result.error || "This code is unavailable.",
                          );
                        setCode("");
                        onNotify('Request sent · waiting for approval');
                      })
                    }
                    style={s.join}
                  >
                    <Ionicons name="arrow-forward" size={21} color="#e9e1ff" />
                  </Pressable>
                </View>
                <Button
                  label="Scan an invite QR"
                  icon="scan-outline"
                  secondary
                  disabled={busy || !connected}
                  onPress={() => setScanning(true)}
                />
              </>
            )}
          </LinearGradient>
          {!!pending.length && (
            <>
              <View style={s.section}>
                <Text style={s.sectionTitle}>New hellos</Text>
              </View>
              {pending.map((c) => (
                <View key={c.id} style={s.contact}>
                  <View style={s.inline}>
                    <Portrait
                      node={{ id: c.id, name: c.name, color: c.color }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{c.name}</Text>
                      <Text style={s.body}>
                        {c.incoming
                          ? "Would like to connect"
                          : "Waiting for their approval"}
                      </Text>
                    </View>
                  </View>
                  {c.incoming && (
                    <View style={s.buttonRow}>
                      <Button
                        label="Accept"
                        disabled={busy || !connected}
                        onPress={() =>
                          void run(
                            () =>
                              respondConnection({
                                connectionId: c.id,
                                accept: true,
                              }),
                            "You’re connected",
                          )
                        }
                      />
                      <Button
                        label="Decline"
                        secondary
                        disabled={busy || !connected}
                        onPress={() =>
                          void run(() =>
                            respondConnection({
                              connectionId: c.id,
                              accept: false,
                            }),
                          )
                        }
                      />
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
          <View style={s.section}>
            <Text style={s.sectionTitle}>People, not contacts.</Text>
            <Ionicons name="heart-outline" size={19} color="#d4a9d3" />
          </View>
          {!accepted.length && (
            <View style={s.empty}>
              <Ionicons name="planet-outline" size={38} color="#a99ad8" />
              <Text style={s.cardTitle}>Your orbit is just beginning.</Text>
              <Text style={s.body}>
                Invite someone above. Once you both connect, save what made the
                conversation matter.
              </Text>
            </View>
          )}
          {accepted.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={`Open connection with ${c.name}`}
              accessibilityState={{ expanded: selected === c.id }}
              onPress={() => {
                setSelected(selected === c.id ? null : c.id);
                setNote("");
                setEditMemory(null);
                setNoteAreas([]);
                setNoteTopics([]);
              }}
              style={[
                s.contact,
                selected === c.id && { borderColor: "#75618e" },
              ]}
            >
              <View style={s.inline}>
                <Portrait
                  node={{ id: c.id, name: c.name, color: c.color }}
                  size={51}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{c.name}</Text>
                  <Text style={s.body}>
                    {c.headline || "Connected in your orbit"}
                  </Text>
                </View>
                <Ionicons
                  name={selected === c.id ? "chevron-up" : "chevron-down"}
                  size={17}
                  color="#a49bb5"
                />
              </View>
            </Pressable>
          ))}
          {person && person.status === "accepted" && (
            <Reveal>
              <View style={s.panel}>
                <Text style={s.cardTitle}>What’s worth remembering?</Text>
                <Button
                  label="Start a conversation"
                  icon="mic-outline"
                  onPress={() =>
                    setCaptureTarget({
                      kind: "conversation",
                      title: `Conversation with ${person.name}`,
                      connectionId: person.id,
                      recordFirst: true,
                    })
                  }
                />
                <Text style={s.body}>
                  A conversation with {person.name}. Write a short note, review
                  it, then invite their approval.
                </Text>
                <Field
                  label="CONVERSATION NOTE"
                  value={note}
                  onChange={setNote}
                  placeholder="We talked about… They’re interested in…"
                  multiline
                />
                <TopicPicker selected={noteTopics} onChange={setNoteTopics} />
                <Text style={s.fieldLabel}>
                  NETWORK CONTEXT · BOTH PEOPLE REVIEW
                </Text>
                <AreaPicker
                  selected={noteAreas}
                  onChange={setNoteAreas}
                  prefix="Memory area"
                />
                <Button
                  label={
                    editMemory
                      ? "Save edit & request approval again"
                      : "Save & request their approval"
                  }
                  icon="checkmark"
                  disabled={!note.trim() || busy || !connected}
                  onPress={() =>
                    void run(async () => {
                      await saveMemory({
                        connectionId: person.id,
                        summary: note.trim(),
                        topicIds: noteTopics,
                        networkAreas: noteAreas.length ? noteAreas : noteTopics,
                        ...(editMemory
                          ? {
                              memoryId: editMemory.id,
                              revision: editMemory.revision,
                            }
                          : {}),
                      });
                      setNote("");
                      setEditMemory(null);
                    }, person.demo ? "Demo context saved · network updating" : "Note saved · waiting for their approval")
                  }
                />
                <Text style={s.fine}>
                  {person.demo ? 'Owner-reviewed simulation. This demo note can update your demo network; it does not claim another person approved it.' : 'This is a reviewed note, not an audio recording. Both people review and approve before a note powers recommendations. Editing resets the other person’s approval.'}
                </Text>
                {data.memories
                  .filter((m) => m.connectionId === person.id)
                  .map((m) => (
                    <View key={m.id} style={s.memory}>
                      <Text style={s.smallLabel}>
                        {m.status === "shared"
                          ? person.demo ? "OWNER-REVIEWED DEMO" : "BOTH APPROVED"
                          : m.approvedByMe
                            ? "WAITING FOR THEIR APPROVAL"
                            : "YOUR APPROVAL NEEDED"}
                      </Text>
                      <Text style={s.memoryText}>{m.summary}</Text>
                      <Text style={s.fine}>
                        Context areas:{" "}
                        {(m.networkAreas || m.topicIds)
                          .map(
                            (id) =>
                              NETWORK_AREAS.find((area) => area.id === id)
                                ?.label || id,
                          )
                          .join(" · ") || "None selected"}
                        . Approval includes these tags.
                      </Text>
                      <View style={s.buttonRow}>
                        {!m.approvedByMe && (
                          <Button
                            label="Approve note"
                            disabled={busy || !connected}
                            onPress={() =>
                              void run(
                                () =>
                                  approveMemory({
                                    memoryId: m.id,
                                    revision: m.revision,
                                  }),
                                "Note approved",
                              )
                            }
                          />
                        )}
                        <Button
                          label="Edit note"
                          secondary
                          onPress={() => {
                            setEditMemory({ id: m.id, revision: m.revision });
                            setNote(m.summary);
                            setNoteTopics(m.topicIds);
                            setNoteAreas(m.networkAreas || m.topicIds);
                          }}
                        />
                        <Button
                          label="Revoke sharing"
                          secondary
                          disabled={busy || !connected}
                          onPress={() =>
                            void run(
                              () => revokeMemory({ memoryId: m.id }),
                              "Memory sharing revoked",
                            )
                          }
                        />
                      </View>
                    </View>
                  ))}
                {confirmRevoke === person.id ? (
                  <View style={s.memory}>
                    <Text style={s.body}>
                      Disconnect from {person.name}? Shared memories will stop
                      powering new recommendations.
                    </Text>
                    <Button
                      label="Confirm disconnect"
                      secondary
                      disabled={busy || !connected}
                      onPress={() =>
                        void run(async () => {
                          await revokeConnection({ connectionId: person.id });
                          setSelected(null);
                          setConfirmRevoke(null);
                        }, "Connection revoked")
                      }
                    />
                    <Button
                      label="Keep connection"
                      secondary
                      onPress={() => setConfirmRevoke(null)}
                    />
                  </View>
                ) : (
                  <Button
                    label="Disconnect"
                    secondary
                    onPress={() => setConfirmRevoke(person.id)}
                  />
                )}
                <PublicSources
                  connectionId={person.id}
                  name={person.name}
                  connected={connected}
                />
              </View>
            </Reveal>
          )}
          <Button
            label={showDemo ? "Hide demo controls" : "Demo controls"}
            secondary
            onPress={() => setShowDemo(!showDemo)}
          />
          {showDemo && (
            <>
              <View style={s.panel}>
                <Text style={s.cardTitle}>Try a social update</Text>
                <Text style={s.body}>
                  A simulated post for your connected friends’ feeds. Nothing is
                  published to a social network.
                </Text>
                <Field
                  label="DEMO POST"
                  value={post}
                  onChange={setPost}
                  placeholder="I’m looking for collaborators in AI…"
                  multiline
                />
                <TopicPicker selected={noteTopics} onChange={setNoteTopics} />
                <Button
                  label="Publish simulated update"
                  disabled={!post.trim() || busy || !connected}
                  onPress={() =>
                    void run(async () => {
                      await publishDemoPost({
                        excerpt: post.trim(),
                        topicIds: noteTopics,
                      });
                      setPost("");
                    }, "Simulation published to your connections")
                  }
                />
                <Button
                  label="Try the Bright Data source replay"
                  secondary
                  disabled={busy || !connected}
                  onPress={() =>
                    void run(
                      () => loadBrightDataDemo({}),
                      "Bright Data demo replay added",
                    )
                  }
                />
                <Text style={s.fine}>
                  Bright Data demo replay · original author Sagar Shah · July 9
                  · vacancy unverified. Replayed on your demo profile; not
                  authored by you.
                </Text>
                {!!data.posts.length && (
                  <View style={s.memory}>
                    <Text style={s.smallLabel}>YOUR RECENT SIGNALS</Text>
                    {data.posts.slice(0, 3).map((p) => (
                      <View key={p.id} style={{ marginTop: 12 }}>
                        <Text style={s.body}>{p.excerpt}</Text>
                        <Text style={s.fine}>
                          {p.provenance === "brightdata-demo"
                            ? "Bright Data demo replay · Sagar Shah · July 9 · vacancy unverified"
                            : "Simulation · authored by you"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
          <View style={s.panel}>
            <Text style={s.cardTitle}>Your orbit, on the big screen.</Text>
            <Text style={s.smallLabel}>
              {data.stageSharing ? "ANONYMOUS PULSE ENABLED" : "SHARING OFF"}
            </Text>
            <Text style={s.body}>
              Allow an anonymous connection pulse on your paired desktop. Names
              and notes stay on your phone.
            </Text>
            <View style={s.buttonRow}>
              <Button
                label="Allow pulse"
                secondary
                disabled={busy || !connected}
                onPress={() =>
                  void run(
                    () => setStageSharing({ enabled: true }),
                    "Anonymous pulse enabled",
                  )
                }
              />
              <Button
                label="Stop pulse"
                secondary
                disabled={busy || !connected}
                onPress={() =>
                  void run(
                    () => setStageSharing({ enabled: false }),
                    "Anonymous pulse disabled",
                  )
                }
              />
            </View>
          </View>
          <NetworkPresentation connected={connected} />
        </>
      ) : (
        <>
          <View style={s.section}>
            <Text style={s.sectionTitle}>From your connections</Text>
            <Pressable
              onPress={() =>
                void run(() => retryFeed({}), "Refreshing your feed")
              }
              disabled={busy || !connected}
              accessibilityLabel="Refresh feed"
            >
              <Ionicons name="refresh-outline" size={20} color="#b6a5ed" />
            </Pressable>
          </View>
          <Button
            label="Manage public profiles in Network"
            icon="newspaper-outline"
            onPress={onOpenNetwork}
            secondary
          />
          {data.feed.status === "loading" && (
            <View style={s.notice}>
              <ActivityIndicator color="#b6a5ed" />
              <Text style={s.noticeText}>
                Finding the threads that connect you…
              </Text>
            </View>
          )}
          {data.feed.status === "error" && (
            <View style={s.error}>
              <Text style={s.errorText}>
                Your feed couldn’t refresh. Try again when connected.
              </Text>
            </View>
          )}
          {!data.feed.items.length && (
            <LinearGradient colors={["#2b253e", "#18252b"]} style={s.empty}>
              <Ionicons name="sparkles-outline" size={44} color="#c7b6ff" />
              <Text style={s.cardTitle}>The right reason to reach out.</Text>
              <Text style={s.body}>
                Connect with someone and both approve a conversation memory. Add
                their public LinkedIn or X profile in Network to import relevant
                updates.
              </Text>
              <Text style={s.fine}>
                Only reviewed memories are used. New discoveries above don’t imply you’ve met.
              </Text>
            </LinearGradient>
          )}
          {data.feed.items.map((item, i) => (
            <Reveal key={item.id} delay={Math.min(i * 70, 280)}>
              <LinearGradient
                colors={i % 2 ? ["#252436", "#1a272b"] : ["#30263d", "#202330"]}
                style={s.feedCard}
              >
                <View style={s.inline}>
                  <Portrait
                    node={{
                      id: item.connectionId,
                      name: item.name,
                      color: item.color,
                    }}
                    size={50}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{item.name}</Text>
                    <Text style={s.body}>
                      {item.headline || "In your orbit"}
                    </Text>
                  </View>
                  <View style={s.signal}>
                    <Ionicons name="sparkles" size={14} color="#d4c2ff" />
                  </View>
                </View>
                <View
                  style={[
                    s.inline,
                    { marginTop: 17, justifyContent: "space-between" },
                  ]}
                >
                  <Text style={s.smallLabel}>
                    {NETWORK_AREAS.find((t) => t.id === item.topicId)?.label}
                  </Text>
                  <Text style={s.smallLabel}>
                    {connected && data.feed.status === "ready"
                      ? "Connected to your context"
                      : "Saved path · offline"}
                  </Text>
                </View>
                <Text style={s.feedHeadline}>A reason to reconnect.</Text>
                <Text style={s.quote}>“{item.excerpt}”</Text>
                <View style={s.memoryPeek}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={17}
                    color="#bfb0df"
                  />
                  <Text style={[s.body, { flex: 1, marginTop: 0 }]}>
                    {item.summary}
                  </Text>
                </View>
                {item.sourceUrl && (
                  <Pressable
                    onPress={() =>
                      void Linking.openURL(item.sourceUrl!).catch(() =>
                        onNotify("Could not open this source"),
                      )
                    }
                  >
                    <Text style={[s.smallLabel, { marginTop: 15 }]}>
                      VIEW ORIGINAL SOURCE ↗
                    </Text>
                  </Pressable>
                )}
                <Text style={s.fine}>
                  {item.provenance === "brightdata-demo"
                    ? "Bright Data demo replay · original author Sagar Shah · July 9 · vacancy unverified"
                    : item.provenance === "brightdata-public"
                      ? `Imported via Bright Data${item.publishedAt ? ` · original post ${new Date(item.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : " · original date unavailable"} · public profile association unverified`
                      : "Simulated social update · real saved relationship"}
                </Text>
                <Button
                  label={
                    expanded === item.id
                      ? "Close suggested reply"
                      : "A thoughtful way to reach out"
                  }
                  icon="arrow-up-right-box"
                  onPress={() => {
                    setExpanded(expanded === item.id ? null : item.id);
                    setComposer(false);
                  }}
                />
                {expanded === item.id && (
                  <View style={s.memory}>
                    <Text style={s.smallLabel}>DRAFT FOR YOU · NOT SENT</Text>
                    <Text selectable style={s.memoryText}>
                      {item.draft}
                    </Text>
                    <Text style={s.fine}>
                      Copy and personalize this in your own messaging app.
                    </Text>
                    <Button
                      label={
                        composer
                          ? "Hide connection details"
                          : "Why this connects"
                      }
                      secondary
                      onPress={() => setComposer(!composer)}
                    />
                    {composer && (
                      <View>
                        <Text style={s.body}>{item.reason}</Text>
                        <SocialProof proof={item.proof} />
                        <Text style={s.fine}>
                          Returned graph path · shared conversation + topic +
                          post.{" "}
                          {connected && data.feed.status === "ready"
                            ? "Current server result."
                            : "Saved result; live status unconfirmed."}
                        </Text>
                        <Button
                          label="Present a redacted path"
                          secondary
                          disabled={busy || !connected}
                          onPress={() =>
                            void run(
                              () => presentPath({ cardId: item.id }),
                              "Redacted path sent to your paired display",
                            )
                          }
                        />
                        <Text style={s.fine}>
                          Explicitly shares a redacted path with your paired
                          desktop.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </LinearGradient>
            </Reveal>
          ))}
        </>
      )}
    </>
  );
}
function SocialProof({ proof }: { proof: GraphProof }) {
  return (
    <View
      testID="social-proof"
      style={{
        marginTop: 18,
        padding: 15,
        borderRadius: 18,
        backgroundColor: "#161520",
      }}
    >
      {proof.traversalNodeIds.map((id, index) => {
        const node = proof.nodes.find((n) => n.id === id);
        const nextId = proof.traversalNodeIds[index + 1];
        const edge = nextId
          ? proof.edges.find(
              (e) =>
                (e.source === id && e.target === nextId) ||
                (e.target === id && e.source === nextId),
            )
          : undefined;
        const forward = edge?.source === id;
        return (
          <React.Fragment key={id}>
            <Text
              testID={`social-proof-node-${index}`}
              accessibilityLabel={id}
              style={{ color: "#ddd1ee", fontSize: 12, lineHeight: 18 }}
            >
              {node?.label || "Unavailable node"}
            </Text>
            {edge && (
              <View
                testID={`social-proof-edge-${index}`}
                accessibilityLabel={`${forward ? "Forward" : "Reverse"}: ${edge.kind}, ${edge.source} → ${edge.target}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginVertical: 10,
                }}
              >
                <Ionicons
                  name={forward ? "arrow-down" : "arrow-up"}
                  size={16}
                  color="#a68acb"
                />
                <Text
                  style={{ fontSize: 8, letterSpacing: 1, color: "#a68acb" }}
                >
                  {edge.kind}
                </Text>
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginTop: 17 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#7e778f"
        accessibilityLabel={label}
        multiline={multiline}
        style={[
          s.input,
          multiline && { minHeight: 92, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
function TopicPicker({
  selected,
  onChange,
  prefix = "Context topic",
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  prefix?: string;
}) {
  return (
    <View style={s.topics}>
      {topics.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="checkbox"
          accessibilityLabel={`${prefix} ${t.name}`}
          accessibilityState={{ checked: selected.includes(t.id) }}
          aria-checked={selected.includes(t.id)}
          onPress={() =>
            onChange(
              selected.includes(t.id)
                ? selected.filter((id) => id !== t.id)
                : [...selected, t.id],
            )
          }
          style={[s.topic, selected.includes(t.id) && s.topicSelected]}
        >
          <Text
            style={[
              s.topicText,
              selected.includes(t.id) && { color: "#e1d3ff" },
            ]}
          >
            {t.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function Button({
  label,
  onPress,
  icon,
  secondary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        {
          opacity: disabled ? 0.4 : pressed ? 0.72 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#bcb3d0" }]}>
        {label}
      </Text>
      {icon && (
        <Ionicons
          name={icon}
          size={17}
          color={secondary ? "#c3b7d9" : "#211b30"}
        />
      )}
    </Pressable>
  );
}
const s = StyleSheet.create({
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  eyebrow: { color: "#9690aa", fontSize: 8, letterSpacing: 1.3 },
  title: {
    fontSize: 31,
    fontWeight: "500",
    letterSpacing: -1.3,
    color: "#f0eafa",
    marginTop: 13,
  },
  headingIcon: {
    width: 45,
    height: 45,
    borderRadius: 18,
    backgroundColor: "#292137",
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#a59bb6",
    marginTop: 10,
    marginBottom: 24,
    lineHeight: 21,
  },
  panel: {
    padding: 21,
    backgroundColor: "#1c1d2b",
    borderRadius: 27,
    marginBottom: 17,
    borderWidth: 1,
    borderColor: "#323043",
  },
  cardTitle: {
    fontSize: 19,
    color: "#f0e9fc",
    fontWeight: "500",
    letterSpacing: -0.4,
  },
  body: { color: "#aaa1b9", fontSize: 12, lineHeight: 19, marginTop: 5 },
  fieldLabel: {
    color: "#a9a0bc",
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  input: {
    color: "#eee6fa",
    backgroundColor: "#111520",
    borderRadius: 15,
    padding: 14,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#393146",
  },
  topics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 11,
    marginBottom: 8,
  },
  topic: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#3b3548",
    backgroundColor: "#1c1b28",
  },
  topicSelected: { backgroundColor: "#3c304e", borderColor: "#85709e" },
  topicText: { color: "#a39aaf", fontSize: 10 },
  colorRow: { flexDirection: "row", gap: 14, marginVertical: 17 },
  color: { width: 29, height: 29, borderRadius: 20 },
  button: {
    backgroundColor: "#cebcf7",
    borderRadius: 18,
    paddingHorizontal: 17,
    paddingVertical: 14,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#211b30",
    flexShrink: 1,
  },
  secondary: {
    backgroundColor: "#282434",
    borderWidth: 1,
    borderColor: "#3d344b",
  },
  fine: { fontSize: 9, lineHeight: 15, color: "#8c839e", marginTop: 12 },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "500",
    letterSpacing: -0.5,
    color: "#e8e1f4",
  },
  count: { fontSize: 8, letterSpacing: 1, color: "#9991a8" },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
    paddingVertical: 5,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: {
    width: 45,
    height: 45,
    backgroundColor: "#3a3049",
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBox: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#14131f",
    borderRadius: 20,
    marginTop: 17,
  },
  code: { fontSize: 29, letterSpacing: 5, color: "#e5d2ff", fontWeight: "600" },
  joinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 14,
  },
  join: {
    height: 46,
    width: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#54416a",
  },
  contact: {
    borderWidth: 1,
    borderColor: "#302c3d",
    borderRadius: 24,
    padding: 17,
    backgroundColor: "#1b1b28",
    marginBottom: 10,
  },
  name: { color: "#eee6fa", fontSize: 16, fontWeight: "500" },
  buttonRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  empty: {
    padding: 29,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1d1c2c",
    borderRadius: 28,
    marginBottom: 20,
  },
  memory: {
    borderTopWidth: 1,
    borderTopColor: "#3b3249",
    marginTop: 20,
    paddingTop: 17,
  },
  smallLabel: { color: "#b9a6d4", fontSize: 8, letterSpacing: 1.2 },
  memoryText: { color: "#d6cae7", fontSize: 14, lineHeight: 22, marginTop: 9 },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    backgroundColor: "#292438",
    borderRadius: 17,
    marginBottom: 16,
    alignItems: "center",
  },
  noticeText: { color: "#bdb0cc", fontSize: 11, lineHeight: 18, flex: 1 },
  error: {
    backgroundColor: "#39232e",
    borderRadius: 17,
    padding: 15,
    marginBottom: 15,
    flexDirection: "row",
    gap: 10,
  },
  errorText: { color: "#f6b3c0", fontSize: 12, lineHeight: 18, flex: 1 },
  feedCard: {
    borderRadius: 29,
    padding: 23,
    borderWidth: 1,
    borderColor: "#44354e",
    marginBottom: 19,
  },
  signal: {
    width: 30,
    height: 30,
    backgroundColor: "#53385f",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  feedHeadline: {
    color: "#efe3fc",
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.7,
    marginTop: 22,
  },
  quote: { color: "#c5b5d0", fontSize: 14, lineHeight: 22, marginTop: 14 },
  memoryPeek: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#18162060",
    borderRadius: 16,
    padding: 13,
    marginTop: 18,
  },
});
