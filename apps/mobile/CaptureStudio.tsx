import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { topics } from "../../packages/core/data";
import { useReducedMotion } from "./useReducedMotion";
import { friendlyError } from "./friendlyError";
import { AreaPicker } from "./AreaPicker";
import { RecorderVisual } from "./RecorderVisual";
import { uploadMime } from '../../packages/core/uploadMedia';
import { ConversationFlow } from './ConversationFlow';

export type CaptureTarget = {
  kind: "goal" | "session" | "conversation";
  title: string;
  talkId?: string;
  connectionId?: Id<"connections">;
  captureId?: Id<"captures">;
  notes?: string;
  recordFirst?: boolean;
};
type Attachment = { uri: string; mime: string; kind: "audio" | "photo" };
const CLOUD =
  process.env.EXPO_PUBLIC_CONVEX_URL ||
  "https://resilient-llama-452.convex.cloud";
const SITE = CLOUD.replace(/\.convex\.cloud$/, ".convex.site");

export function CaptureCenter({
  connected,
  goal = "",
}: {
  connected: boolean;
  goal?: string;
}) {
  const captures = useQuery(api.captures.mine, {});
  const [target, setTarget] = useState<CaptureTarget | null>(null);
  return (
    <View style={s.panel}>
      {target && (
        <CaptureStudio
          target={target}
          connected={connected}
          onClose={() => setTarget(null)}
        />
      )}
      <View style={s.row}>
        <Ionicons name="sparkles-outline" size={22} color="#c7adef" />
        <Text style={s.title}>Keep the good parts.</Text>
      </View>
      <Text style={s.body}>
        Set your conference goal, or revisit the conversations and sessions you
        captured.
      </Text>
      <StudioButton
        label="Shape my conference goal"
        icon="compass-outline"
        onPress={() =>
          setTarget({ kind: "goal", title: "My conference goal", notes: goal })
        }
      />
      {(captures || []).slice(0, 8).map((capture) => (
        <Pressable
          key={capture.id}
          accessibilityRole="button"
          accessibilityLabel={`Review capture ${capture.title}`}
          onPress={() =>
            setTarget({
              kind: capture.kind,
              title: capture.title,
              talkId: capture.talkId,
              connectionId: capture.connectionId,
              captureId: capture.id,
            })
          }
          style={s.captureRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.captureTitle}>{capture.title}</Text>
            <Text style={s.fine}>
              {capture.kind} · {capture.status} · {capture.attachmentCount}{" "}
              attachments
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#b39acb" />
        </Pressable>
      ))}
      <Text style={s.fine}>
        Capture a session from Discover, or open a connection for conversation
        notes, audio and photos. Nothing becomes a shared memory until reviewed.
      </Text>
    </View>
  );
}

export function CaptureStudio(props: {target:CaptureTarget;connected:boolean;onClose:()=>void}) {
  return props.target.kind==='conversation'&&props.target.recordFirst&&!props.target.captureId
    ? <ConversationFlow {...props} renderReview={id=><CaptureReview captureId={id} connected={props.connected} onRemoved={props.onClose}/>}/>
    : <CaptureStudioEditor {...props}/>;
}
function CaptureStudioEditor({
  target,
  connected,
  onClose,
}: {
  target: CaptureTarget;
  connected: boolean;
  onClose: () => void;
}) {
  const token = useAuthToken();
  const reducedMotion = useReducedMotion();
  const social = useQuery(
    api.social.mine,
    target.kind === "conversation" ? {} : "skip",
  );
  const [chosenConnection, setChosenConnection] = useState(target.connectionId);
  const [linkCode, setLinkCode] = useState("");
  const [showNotes, setShowNotes] = useState(!target.recordFirst);
  const connectDemo = useMutation(api.demo.connect);
  const create = useMutation(api.captures.create),
    analyze = useMutation(api.captures.analyze);
  const [captureId, setCaptureId] = useState<Id<"captures"> | undefined>(
    target.captureId,
  );
  const [title, setTitle] = useState(target.title.slice(0, 120)),
    [notes, setNotes] = useState(target.notes || ""),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  const [photos, setPhotos] = useState<Attachment[]>([]),
    [audio, setAudio] = useState<Attachment | null>(null),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState("");
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 64000,
  });
  const recorderState = useAudioRecorderState(recorder, 250);
  const recordingRef = useRef(false),
    mounted = useRef(true),
    stopping = useRef(false),
    abort = useRef<AbortController | null>(null),
    limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = async () => {
    if (!recordingRef.current || stopping.current) return;
    stopping.current = true;
    if (limitTimer.current) clearTimeout(limitTimer.current);
    try {
      await recorder.stop();
      if (mounted.current && recorder.uri)
        setAudio({
          uri: recorder.uri,
          mime: Platform.OS === "web" ? "audio/webm" : "audio/mp4",
          kind: "audio",
        });
    } catch {
      if (mounted.current)
        setError(
          "Recording stopped, but the audio couldn’t be saved. Your typed notes are still available.",
        );
    } finally {
      recordingRef.current = false;
      stopping.current = false;
      if (mounted.current) setRecording(false);
      void setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
      }).catch(() => {});
    }
  };
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && recordingRef.current) void stop();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      if (limitTimer.current) clearTimeout(limitTimer.current);
      abort.current?.abort();
      if (recordingRef.current) void recorder.stop().catch(() => {});
      void setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
      }).catch(() => {});
    };
  }, [recorder]);
  useEffect(() => {
    if (
      !recorderState.isRecording &&
      recorderState.durationMillis > 0 &&
      recordingRef.current &&
      !stopping.current
    ) {
      recordingRef.current = false;
      setRecording(false);
      if (limitTimer.current) clearTimeout(limitTimer.current);
      if (recorder.uri)
        setAudio({
          uri: recorder.uri,
          mime: Platform.OS === "web" ? "audio/webm" : "audio/mp4",
          kind: "audio",
        });
      void setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
      }).catch(() => {});
    }
  }, [recorderState.isRecording, recorderState.durationMillis, recorder]);
  async function start() {
    if (!consent || busy || recordingRef.current) return;
    setError("");
    setBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(
          "Microphone permission wasn’t granted. You can still type notes or add a photo.",
        );
        return;
      }
      if (!mounted.current || AppState.currentState !== "active") return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
      });
      await recorder.prepareToRecordAsync();
      if (!mounted.current || AppState.currentState !== "active") {
        await recorder.stop().catch(() => {});
        return;
      }
      setAudio(null);
      recordingRef.current = true;
      setRecording(true);
      recorder.record({ forDuration: 90 });
      limitTimer.current = setTimeout(() => void stop(), 90_000);
    } catch {
      setError(
        "Couldn’t start recording. Check microphone permissions or use typed notes.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function addPhoto(camera: boolean) {
    if (!consent || photos.length >= 3 || recording || busy) return;
    setBusy(true);
    setError("");
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            "Camera permission wasn’t granted. Choose a photo from your library or type notes instead.",
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
        exif: false,
        base64: Platform.OS !== "web",
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && mounted.current) {
        const asset = result.assets[0];
        const jpegUri =
          Platform.OS !== "web" && asset.base64
            ? `data:image/jpeg;base64,${asset.base64}`
            : null;
        const bytes = jpegUri
          ? Math.ceil((asset.base64!.length * 3) / 4)
          : asset.fileSize;
        if (bytes && bytes > 4 * 1024 * 1024)
          throw new Error("Choose a photo under 4 MB.");
        setPhotos(
          (previous) =>
            [
              ...previous,
              {
                uri: jpegUri || asset.uri,
                mime: jpegUri ? "image/jpeg" : asset.mimeType || "image/jpeg",
                kind: "photo",
              },
            ].slice(0, 3) as Attachment[],
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add that photo.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submit() {
    if (
      !connected ||
      !token ||
      busy ||
      recording ||
      !consent ||
      (target.kind === "conversation" && !chosenConnection) ||
      (!notes.trim() && !audio && !photos.length)
    )
      return;
    setBusy(true);
    setError("");
    setStage("Preparing your capture…");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const attachments = [...(audio ? [audio] : []), ...photos];
      const blobs = await Promise.all(
        attachments.map(async (attachment) => {
          const blob = await (await fetch(attachment.uri)).blob();
          const mime = uploadMime(attachment.kind,attachment.mime,blob.type);
          const limit =
            attachment.kind === "audio" ? 8 * 1024 * 1024 : 4 * 1024 * 1024;
          if (!blob.size || blob.size > limit)
            throw new Error(
              `${attachment.kind === "audio" ? "Audio must be under 8 MB" : "Each photo must be under 4 MB"}.`,
            );
          if (
            attachment.kind === "photo" &&
            !["image/jpeg", "image/png", "image/webp"].includes(mime)
          )
            throw new Error("Choose a JPEG, PNG or WebP photo.");
          return { blob, mime };
        }),
      );
      if (!mounted.current) return;
      const id = await create({
        kind: target.kind,
        title: title.trim() || target.title,
        notes: notes.trim(),
        talkId: target.talkId,
        connectionId: chosenConnection,
        consentConfirmed: consent,
      });
      setCaptureId(id);
      for (let index = 0; index < blobs.length; index++) {
        setStage(`Uploading privately · ${index + 1} of ${blobs.length}`);
        const response = await fetch(
          `${SITE}/capture-upload?captureId=${encodeURIComponent(id)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": blobs[index].mime,
            },
            body: blobs[index].blob,
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          let detail =
            "An attachment couldn’t upload. Remove this incomplete capture and try again.";
          try {
            const body = await response.json();
            if (typeof body.error === "string") detail = body.error;
          } catch {}
          throw new Error(detail);
        }
      }
      setStage("Preparing your AI draft…");
      await analyze({ captureId: id, revision: 1 });
    } catch (e) {
      if (mounted.current)
        setError(
          friendlyError(
            e,
            "Couldn’t prepare this capture. Your unsent notes remain here.",
          ),
        );
    } finally {
      if (mounted.current) {
        setBusy(false);
        setStage("");
      }
      abort.current = null;
    }
  }
  async function linkDemo() {
    if (!connected || busy || recording) return;
    if (linkCode.trim() !== "123456") {
      setError(
        "This shortcut accepts demo code 123456 only. For a real person, use their invite in Network, wait for acceptance, then select them here.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await connectDemo({ code: linkCode.trim() });
      if (mounted.current) setChosenConnection(result.connectionId);
    } catch (e) {
      if (mounted.current)
        setError(
          friendlyError(
            e,
            "Couldn’t link the demo connection. Your recording remains on this device.",
          ),
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const close = async () => {
    await stop();
    onClose();
  };
  return (
    <Modal
      animationType={reducedMotion ? "none" : "slide"}
      transparent
      onRequestClose={() => void close()}
    >
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>
                {target.kind.toUpperCase()} · PRIVATE CAPTURE
              </Text>
              <Text style={s.modalTitle}>
                {captureId ? "Make it worth keeping." : "Stay in the moment."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close capture"
              onPress={() => void close()}
              style={s.close}
            >
              <Ionicons name="close" size={23} color="#eadff7" />
            </Pressable>
          </View>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {busy && (
              <View style={s.row}>
                <ActivityIndicator color="#cbb1ef" />
                <Text style={s.body}>{stage || "Getting ready…"}</Text>
              </View>
            )}
            {captureId ? (
              <CaptureReview
                captureId={captureId}
                connected={connected && !busy}
                onRemoved={onClose}
              />
            ) : (
              <>
                {target.recordFirst && (
                  <RecorderVisual
                    recording={recording}
                    elapsed={recorderState.durationMillis}
                    recorded={!!audio}
                  />
                )}
                {(!target.recordFirst || showNotes) && (
                  <>
                    <Text style={s.body}>
                      {target.kind === "goal"
                        ? "Tell us what you hope to learn, build or discover. Review the suggested interests before they shape your recommendations."
                        : "A short recording, a photo, or a few words. AI prepares a draft; you decide what belongs in your memory."}
                    </Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      accessibilityLabel="Capture title"
                      placeholder="Give this moment a title"
                      placeholderTextColor="#8b7c9d"
                      style={s.input}
                      maxLength={120}
                    />
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      accessibilityLabel="Capture notes"
                      placeholder={
                        target.kind === "goal"
                          ? "I’m here to learn about… I’d love to meet…"
                          : "What stood out? What should you follow up on?"
                      }
                      placeholderTextColor="#8b7c9d"
                      style={[
                        s.input,
                        { minHeight: 105, textAlignVertical: "top" },
                      ]}
                      multiline
                      maxLength={6000}
                    />
                  </>
                )}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel="Confirm capture and AI processing consent"
                  accessibilityState={{ checked: consent }}
                  aria-checked={consent}
                  disabled={recording}
                  onPress={() => setConsent(!consent)}
                  style={s.consent}
                >
                  <Ionicons
                    name={consent ? "checkbox" : "square-outline"}
                    size={22}
                    color="#c6abe9"
                  />
                  <Text style={[s.body, { flex: 1, marginTop: 0 }]}>
                    {target.kind === "conversation"
                      ? "Everyone agreed to this capture and private AI processing."
                      : target.kind === "session"
                        ? "I have permission to capture this session or its materials and send them for private AI processing."
                        : "Send these notes for private AI processing. I’ll review the result before saving."}
                  </Text>
                </Pressable>
                {target.recordFirst && !audio && !recording && !showNotes && (
                  <StudioButton
                    label="Use notes instead"
                    icon="create-outline"
                    secondary
                    onPress={() => setShowNotes(true)}
                  />
                )}
                {target.kind !== "goal" && (
                  <>
                    <View style={s.mediaRow}>
                      <StudioButton
                        label={
                          recording
                            ? `Stop recording · ${Math.floor(recorderState.durationMillis / 1000)}s`
                            : audio
                              ? "Record again"
                              : "Record up to 90 seconds"
                        }
                        icon={recording ? "stop-circle-outline" : "mic-outline"}
                        disabled={!consent || busy}
                        onPress={() => void (recording ? stop() : start())}
                      />
                    </View>
                    {recording && (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={s.recording}
                      >
                        ● Recording now · stops at 90 seconds or when you leave
                        this screen
                      </Text>
                    )}
                    {!!audio && !recording && (
                      <View style={s.attachment}>
                        <Ionicons
                          name="musical-note-outline"
                          size={20}
                          color="#c5afe4"
                        />
                        <Text style={[s.body, { flex: 1 }]}>
                          Audio attached · not uploaded yet
                        </Text>
                        <Pressable
                          accessibilityLabel="Remove recorded audio"
                          accessibilityRole="button"
                          onPress={() => setAudio(null)}
                        >
                          <Ionicons
                            name="close-circle"
                            size={22}
                            color="#b2a0c3"
                          />
                        </Pressable>
                      </View>
                    )}
                    {target.kind === "conversation" &&
                      !recording &&
                      (!!audio || showNotes) && (
                        <View style={s.panel}>
                          <Text style={s.title}>Link this conversation</Text>
                          <Text style={s.body}>
                            Choose someone you’re connected with. You’ll review
                            the context next; they still approve any shared
                            memory.
                          </Text>
                          {(social?.connections || [])
                            .filter((person) => person.status === "accepted")
                            .map((person) => (
                              <Pressable
                                key={person.id}
                                accessibilityRole="radio"
                                accessibilityLabel={`Link conversation to ${person.name}`}
                                accessibilityState={{
                                  checked: chosenConnection === person.id,
                                }}
                                onPress={() => setChosenConnection(person.id)}
                                style={s.captureRow}
                              >
                                <Ionicons
                                  name={
                                    chosenConnection === person.id
                                      ? "radio-button-on"
                                      : "radio-button-off"
                                  }
                                  size={20}
                                  color="#b9efd9"
                                />
                                <Text
                                  style={[s.captureTitle, { marginLeft: 10 }]}
                                >
                                  {person.name}
                                </Text>
                              </Pressable>
                            ))}
                          {!chosenConnection && (
                            <Text style={s.fine}>
                              Select an accepted connection before creating a
                              draft.
                            </Text>
                          )}
                          <TextInput
                            accessibilityLabel="Conversation connection code"
                            value={linkCode}
                            onChangeText={setLinkCode}
                            placeholder="Demo code · 123456"
                            placeholderTextColor="#8b7c9d"
                            maxLength={8}
                            autoCapitalize="characters"
                            style={s.input}
                          />
                          <StudioButton
                            label="Link demo conversation"
                            icon="link-outline"
                            secondary
                            disabled={!connected || busy || !linkCode.trim()}
                            onPress={() => void linkDemo()}
                          />
                          <Text style={s.fine}>
                            123456 creates Alex, an explicitly simulated
                            connection. Real connections require their
                            acceptance in Network.
                          </Text>
                        </View>
                      )}
                    {target.recordFirst &&
                      !!audio &&
                      !!chosenConnection &&
                      !showNotes && (
                        <StudioButton
                          label="Add a title or notes"
                          icon="create-outline"
                          secondary
                          onPress={() => setShowNotes(true)}
                        />
                      )}
                    {(!target.recordFirst ||
                      showNotes ||
                      (!!audio && !!chosenConnection)) && (
                      <>
                        <View style={s.mediaRow}>
                          <StudioButton
                            label="Take photo"
                            icon="camera-outline"
                            secondary
                            disabled={
                              !consent ||
                              photos.length >= 3 ||
                              recording ||
                              busy
                            }
                            onPress={() => void addPhoto(true)}
                          />
                          <StudioButton
                            label="Choose photo"
                            icon="images-outline"
                            secondary
                            disabled={
                              !consent ||
                              photos.length >= 3 ||
                              recording ||
                              busy
                            }
                            onPress={() => void addPhoto(false)}
                          />
                        </View>
                        <View style={s.mediaRow}>
                          {photos.map((photo, i) => (
                            <View key={photo.uri} style={{ marginTop: 12 }}>
                              <Image
                                source={{ uri: photo.uri }}
                                style={{
                                  width: 82,
                                  height: 82,
                                  borderRadius: 17,
                                }}
                              />
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Remove photo ${i + 1}`}
                                onPress={() =>
                                  setPhotos((previous) =>
                                    previous.filter((_, index) => index !== i),
                                  )
                                }
                                style={s.removePhoto}
                              >
                                <Ionicons
                                  name="close-circle"
                                  color="#eee3f8"
                                  size={23}
                                />
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                    <Text style={s.fine}>
                      {photos.length}/3 photos · up to 4 MB each · one audio
                      clip up to 8 MB. No background recording.
                    </Text>
                  </>
                )}
                {(!target.recordFirst || !!audio || showNotes) && (
                  <>
                    <StudioButton
                      label="Create a draft for my review"
                      icon="sparkles-outline"
                      disabled={
                        !connected ||
                        !consent ||
                        busy ||
                        recording ||
                        (target.kind === "conversation" && !chosenConnection) ||
                        (!notes.trim() && !audio && !photos.length)
                      }
                      onPress={() => void submit()}
                    />
                    <Text style={s.fine}>
                      Submitting uploads the selected capture to your private
                      workspace for AI processing. Raw media isn’t published or
                      sent to your connection. You can remove the capture later.
                    </Text>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CaptureReview({
  captureId,
  connected,
  onRemoved,
}: {
  captureId: Id<"captures">;
  connected: boolean;
  onRemoved: () => void;
}) {
  const captures = useQuery(api.captures.mine, {}),
    capture = captures?.find((item) => item.id === captureId);
  const analyze = useMutation(api.captures.analyze),
    approve = useMutation(api.captures.approve),
    remove = useMutation(api.captures.remove);
  const [summary, setSummary] = useState(""),
    [selectedTopics, setSelectedTopics] = useState<string[]>([]),
    [takeaways, setTakeaways] = useState(""),
    [actions, setActions] = useState(""),
    [attended, setAttended] = useState(false),
    [confirmRemove, setConfirmRemove] = useState(false),
    [manualReview, setManualReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [networkAreas, setNetworkAreas] = useState<string[]>([]);
  useEffect(() => {
    if (
      !capture ||
      !["review", "error", "approved", "collecting"].includes(capture.status)
    )
      return;
    setSummary((capture.draft?.summary || capture.notes || "").slice(0, 1000));
    setSelectedTopics(capture.draft?.topicIds || []);
    setNetworkAreas(
      capture.draft?.networkAreas || capture.draft?.topicIds || [],
    );
    setTakeaways((capture.draft?.takeaways || []).join("\n"));
    setActions((capture.draft?.actions || []).join("\n"));
    setAttended(capture.attended);
  }, [capture?.revision, capture?.status]);
  async function run(task: () => Promise<unknown>) {
    if (busy || !connected) return;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(friendlyError(e, "Couldn’t update this capture."));
    } finally {
      setBusy(false);
    }
  }
  if (!capture)
    return <ActivityIndicator color="#cbb1ef" style={{ margin: 24 }} />;
  const editable =
    capture.status === "review" ||
    capture.status === "error" ||
    (capture.status === "collecting" && manualReview);
  const reviewedLines = (text: string) => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 5 || lines.some((line) => line.length > 200))
      throw new Error(
        "Use up to 5 takeaways and 5 next steps, each under 200 characters.",
      );
    return lines;
  };
  return (
    <View>
      <Text style={s.title}>{capture.title}</Text>
      <Text style={s.fine}>
        {capture.status === "approved"
          ? capture.autoSaveDemo ? "Automatically extracted · demo context" : "Reviewed & approved by you"
          : capture.status === "error"
            ? "Draft unavailable · manual review available"
            : capture.agentStage || capture.status}
      </Text>
      {(capture.status === "processing" || capture.status === "collecting") && (
        <View style={s.processing}>
          <ActivityIndicator color="#c8b0ea" />
          <Text style={s.body}>
            {capture.status === "processing"
              ? "Your private capture is being processed. You can close this screen and return from Network."
              : `Saved with ${capture.attachmentCount} uploaded attachments. If an upload was interrupted, analyze what was saved, review notes manually, or remove this capture and start again.`}
          </Text>
        </View>
      )}
      {capture.error && <Text style={s.error}>{capture.error}</Text>}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!capture.transcript && (
        <View style={s.transcript}>
          <Text style={s.eyebrow}>TRANSCRIPT · CHECK FOR MISTAKES</Text>
          <Text selectable style={s.body}>
            {capture.transcript}
          </Text>
        </View>
      )}
      {(editable || capture.status === "approved") && (
        <>
          <Text style={s.body}>
            {capture.autoSaveDemo && capture.status === 'approved' ? 'Extracted automatically for your simulated connection. Not human-reviewed.' : capture.draftOrigin === "openai"
              ? capture.status === "approved"
                ? "AI-assisted draft · reviewed and approved by you."
                : "AI prepared this draft. Edit anything inaccurate before approving."
              : capture.status === "approved"
                ? "Manually reviewed and approved by you. No AI-generated draft was used."
                : "No AI draft is available. Write and review your own summary below."}
          </Text>
          <TextInput
            accessibilityLabel="Review capture summary"
            value={summary}
            onChangeText={setSummary}
            editable={editable}
            multiline
            style={[s.input, { minHeight: 100, textAlignVertical: "top" }]}
            maxLength={1000}
          />
          <Text style={s.fine}>
            Summary · up to 1,000 characters. Original notes stay with this
            private capture.
          </Text>
          <Text style={s.eyebrow}>NETWORK CONTEXT · REVIEW THESE AREAS</Text>
          <AreaPicker
            selected={networkAreas}
            onChange={setNetworkAreas}
            disabled={!editable}
            prefix="Capture area"
          />
          <Text style={s.fine}>
            Reviewed learning stays separate from personal expertise.
            Conversation areas become shared context only after both approvals.
          </Text>
          <Text style={[s.eyebrow, { marginTop: 18 }]}>
            SESSION INTERESTS · OPTIONAL
          </Text>
          <View style={s.topicRow}>
            {topics.map((topic) => (
              <Pressable
                key={topic.id}
                accessibilityRole="checkbox"
                accessibilityLabel={`Capture topic ${topic.name}`}
                accessibilityState={{
                  checked: selectedTopics.includes(topic.id),
                }}
                aria-checked={selectedTopics.includes(topic.id)}
                disabled={!editable}
                onPress={() =>
                  setSelectedTopics((previous) =>
                    previous.includes(topic.id)
                      ? previous.filter((id) => id !== topic.id)
                      : [...previous, topic.id],
                  )
                }
                style={[
                  s.topic,
                  selectedTopics.includes(topic.id) && {
                    backgroundColor: "#43304f",
                    borderColor: "#9272ad",
                  },
                ]}
              >
                <Text style={s.topicText}>{topic.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.eyebrow}>TAKEAWAYS · ONE PER LINE</Text>
          <Text style={s.fine}>
            Up to 5 takeaways and 5 next steps · 200 characters per line.
          </Text>
          <TextInput
            accessibilityLabel="Review capture takeaways"
            value={takeaways}
            onChangeText={setTakeaways}
            editable={editable}
            multiline
            style={s.input}
            maxLength={3000}
          />
          <Text style={s.eyebrow}>NEXT STEPS · ONE PER LINE</Text>
          <TextInput
            accessibilityLabel="Review capture actions"
            value={actions}
            onChangeText={setActions}
            editable={editable}
            multiline
            style={s.input}
            maxLength={3000}
          />
          {capture.kind === "session" && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="I attended this session"
              accessibilityState={{ checked: attended }}
              aria-checked={attended}
              disabled={!editable}
              onPress={() => setAttended(!attended)}
              style={s.consent}
            >
              <Ionicons
                name={attended ? "checkbox" : "square-outline"}
                size={22}
                color="#c6abe9"
              />
              <Text style={s.body}>
                I attended this session · self-reported
              </Text>
            </Pressable>
          )}
          {editable && (
            <StudioButton
              label={
                capture.kind === "conversation"
                  ? "Approve & ask my connection to review"
                  : "Approve this private capture"
              }
              disabled={
                !connected ||
                busy ||
                !summary.trim() ||
                (!selectedTopics.length && !networkAreas.length)
              }
              onPress={() =>
                void run(() =>
                  approve({
                    captureId,
                    revision: capture.revision,
                    summary: summary.trim(),
                    topicIds: selectedTopics,
                    networkAreas: networkAreas.length
                      ? networkAreas
                      : selectedTopics,
                    takeaways: reviewedLines(takeaways),
                    actions: reviewedLines(actions),
                    ...(capture.kind === "session" ? { attended } : {}),
                  }),
                )
              }
            />
          )}
          <Text style={s.fine}>
            {capture.kind === "conversation"
              ? "Your approval creates a memory draft. The other person must approve it before it powers shared recommendations."
              : capture.kind === "goal"
                ? "Approving updates your private session interests and refreshes recommendations."
                : "Your approved session notes stay private. Attendance is only marked if you explicitly check it."}
          </Text>
        </>
      )}
      {capture.status === "collecting" && connected && (
        <StudioButton
          label="Review saved notes manually"
          secondary
          onPress={() => setManualReview(true)}
        />
      )}
      {["error", "collecting"].includes(capture.status) && (
        <StudioButton
          label={
            capture.status === "collecting"
              ? "Analyze saved capture"
              : "Retry AI draft"
          }
          secondary
          disabled={!connected || busy}
          onPress={() =>
            void run(() => analyze({ captureId, revision: capture.revision }))
          }
        />
      )}
      <StudioButton
        label={
          confirmRemove
            ? "Confirm remove capture & raw media"
            : "Remove this capture"
        }
        secondary
        disabled={!connected || busy}
        onPress={() => {
          if (!confirmRemove) setConfirmRemove(true);
          else
            void run(async () => {
              await remove({ captureId });
              onRemoved();
            });
        }}
      />
      {confirmRemove && (
        <Text style={s.fine}>
          This removes the raw capture and revokes its attached conversation
          memory, if any.
        </Text>
      )}
      {busy && <ActivityIndicator color="#c6abe9" style={{ marginTop: 15 }} />}
    </View>
  );
}

function StudioButton({
  label,
  onPress,
  icon,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  secondary?: boolean;
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
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={secondary ? "#c3a9df" : "#281b35"}
        />
      )}
      <Text style={[s.buttonText, secondary && { color: "#c3a9df" }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  panel: {
    backgroundColor: "#211c2d",
    borderWidth: 1,
    borderColor: "#3d304d",
    borderRadius: 26,
    padding: 20,
    marginBottom: 18,
  },
  title: {
    color: "#f0e5fb",
    fontSize: 20,
    fontWeight: "500",
    letterSpacing: -0.5,
  },
  body: { color: "#b5a4c8", fontSize: 12, lineHeight: 20, marginTop: 9 },
  fine: { color: "#9481a7", fontSize: 9, lineHeight: 15, marginTop: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#3a2e48",
    paddingTop: 15,
    marginTop: 16,
  },
  captureTitle: { color: "#d6c5e8", fontSize: 13 },
  backdrop: {
    flex: 1,
    backgroundColor: "#080610b0",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#191522",
    borderTopLeftRadius: 31,
    borderTopRightRadius: 31,
    padding: 23,
    maxHeight: "94%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 18,
  },
  modalTitle: {
    fontSize: 27,
    letterSpacing: -1,
    color: "#eadcf7",
    fontWeight: "500",
    marginTop: 8,
  },
  eyebrow: { color: "#a48ab8", fontSize: 8, letterSpacing: 1.2, marginTop: 10 },
  close: { borderRadius: 22, padding: 9, backgroundColor: "#32243f" },
  input: {
    padding: 14,
    marginTop: 14,
    marginBottom: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3b2d49",
    backgroundColor: "#110f19",
    color: "#e9dcf5",
    fontSize: 13,
    lineHeight: 20,
  },
  consent: {
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
    marginVertical: 17,
  },
  button: {
    backgroundColor: "#cbb1ef",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    color: "#281b35",
    fontWeight: "600",
    fontSize: 12,
    flexShrink: 1,
  },
  secondary: {
    backgroundColor: "#2c2237",
    borderWidth: 1,
    borderColor: "#453052",
  },
  mediaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recording: { color: "#f0a2bc", fontSize: 11, lineHeight: 18, marginTop: 13 },
  attachment: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 13,
  },
  removePhoto: { position: "absolute", right: -7, top: -7 },
  error: { color: "#f1afc1", fontSize: 12, lineHeight: 19, marginVertical: 13 },
  processing: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#261c33",
    marginTop: 16,
  },
  transcript: {
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#241b30",
    marginTop: 16,
  },
  topicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
    marginBottom: 15,
  },
  topic: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#3f2c50",
    borderRadius: 18,
  },
  topicText: { color: "#cbb7de", fontSize: 10 },
});
