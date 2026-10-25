import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ConvexReactClient,
  useAction,
  useConvexAuth,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  event,
  people,
  rooms,
  speakers,
  speakerFor,
  talks,
  topics,
  type Person,
  type Talk,
} from "../../packages/core/data";
import { demoGraph } from "../../packages/core/demoGraph";
import { officialProgramSource } from "../../packages/core/officialProgram";
import { profileSourcesById } from "../../packages/core/profileSources";
import type { GraphProof } from "../../packages/core/intelligence";
import {
  PresentationConsent,
  PresentationSummary,
} from "./PresentationConsent";

import { OrbitHome, Portrait, Reveal } from "./OrbitHome";
import { SocialSpace } from "./SocialSpace";
import { readIncomingInvite } from "./inviteLink";
import { CaptureStudio, type CaptureTarget } from "./CaptureStudio";
import { WelcomeFlow } from './WelcomeFlow';
import { NetworkPage,FeedPage } from './SocialPages';

const C = {
  ink: "#eeeaf8",
  muted: "#a59db8",
  bg: "#10121c",
  line: "#303041",
  lime: "#c6b5fa",
  white: "#1c1e2b",
  lilac: "#ddd1f6",
};
const STORAGE = "conferenceos-mobile-official-preferences-v2";
const URL =
  process.env.EXPO_PUBLIC_CONVEX_URL ||
  "https://resilient-llama-452.convex.cloud";
const ACTIVE_DEMO_PROFILE = 'conferenceos-active-demo-profile-v1';
const desktopGraphUrl = (() => {
  if (process.env.EXPO_PUBLIC_GRAPH_URL)
    return process.env.EXPO_PUBLIC_GRAPH_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:5173`;
  if (Platform.OS === "web" && typeof window !== "undefined")
    return `${window.location.protocol}//${window.location.hostname}:5173`;
  return null;
})();
type IconName =
  React.ComponentProps<typeof Ionicons>["name"] | "arrow-up-right";
type Tab = "Today" | "Sessions" | "People" | "Plan" | "Orbit" | "Feed";
type Preferences = {
  bookmarks: string[];
  topicIds: string[];
  met: string[];
  revision: number;
};
type Outbox = {
  bookmarks: Record<string, boolean>;
  met: Record<string, boolean>;
  topicIds: string[] | null;
};
type Proof = {
  title: string;
  kind: "session" | "person";
  targetId: string;
};
const defaults: Preferences = {
  bookmarks: [],
  topicIds: ["ai", "security"],
  met: [],
  revision: 0,
};
const emptyOutbox = (): Outbox => ({ bookmarks: {}, met: {}, topicIds: null });
const overlay = (server: Preferences, outbox: Outbox): Preferences => {
  const merge = (existing: string[], pending: Record<string, boolean>) => [
    ...new Set([
      ...existing.filter((id) => pending[id] !== false),
      ...Object.keys(pending).filter((id) => pending[id]),
    ]),
  ];
  return {
    bookmarks: merge(server.bookmarks, outbox.bookmarks),
    met: merge(server.met, outbox.met),
    topicIds: outbox.topicIds ?? server.topicIds,
    revision: server.revision,
  };
};
const speakerOf = speakerFor;
const presentersOf = (talk: Talk) =>
  speakers.filter((speaker) => talk.speakerIds.includes(speaker.id));
const roomOf = (talk: Talk) =>
  rooms.find((p) => p.id === talk.roomId)?.name || "See official schedule";
const topicOf = (id: string) => topics.find((p) => p.id === id)!;
const cleanPreferences = (prefs: Preferences): Preferences => ({
  bookmarks: prefs.bookmarks.filter((id) =>
    talks.some((talk) => talk.id === id),
  ),
  topicIds: prefs.topicIds.filter((id) =>
    topics.some((topic) => topic.id === id),
  ),
  met: prefs.met.filter((id) => people.some((person) => person.id === id)),
  revision: prefs.revision ?? 0,
});
const sameTopics = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export default function App() {
  const [fontsLoaded] = useFonts(Ionicons.font);
  const [profileSlot, setProfileSlot] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState('');
  useEffect(() => {
    void AsyncStorage.getItem(ACTIVE_DEMO_PROFILE).then(value => {
      setProfileSlot(value && /^demo[0-9]+$/.test(value) ? value : 'original');
    }).catch(() => setProfileSlot('original'));
  }, []);
  async function switchProfile(slot: string) {
    try {
      await AsyncStorage.setItem(ACTIVE_DEMO_PROFILE, slot);
      setSwitchError('');
      setProfileSlot(slot);
    } catch { setSwitchError('Could not switch profiles. Please try again.'); }
  }
  if (!fontsLoaded || !profileSlot)
    return (
      <View style={s.loading}>
        <ActivityIndicator color={C.ink} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <ProfileSession key={profileSlot} slot={profileSlot} onNewProfile={() => void switchProfile(`demo${Date.now()}`)} onOriginalProfile={() => void switchProfile('original')} />
      {!!switchError && <Text accessibilityRole="alert" style={{position:'absolute',bottom:100,padding:20,color:'#ffc8bd',backgroundColor:'#151924'}}>{switchError}</Text>}
    </SafeAreaProvider>
  );
}

function ProfileSession({slot,onNewProfile,onOriginalProfile}:{slot:string;onNewProfile:()=>void;onOriginalProfile:()=>void}) {
  const client = useMemo(() => new ConvexReactClient(URL, {unsavedChangesWarning:false}), []);
  // Auth/query children must unsubscribe before the old connection closes.
  useEffect(() => () => { setTimeout(() => { void client.close(); }, 0); }, [client]);
  const original = slot === 'original';
  return <ConvexAuthProvider client={client} storage={AsyncStorage} storageNamespace={original ? URL : `${URL}${slot}`}>
    <ConferenceApp convex={client} onNewProfile={onNewProfile} onOriginalProfile={onOriginalProfile} originalProfile={original} preferencesStorageKey={original ? STORAGE : `${STORAGE}-${slot}`} />
  </ConvexAuthProvider>;
}

function ConferenceApp({convex,onNewProfile,onOriginalProfile,originalProfile,preferencesStorageKey}:{convex:ConvexReactClient;onNewProfile:()=>void;onOriginalProfile:()=>void;originalProfile:boolean;preferencesStorageKey:string}) {
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("Orbit");
  const [homeVisit,setHomeVisit]=useState(0);
  const pageScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const [welcome,setWelcome]=useState(false),[welcomeSeen,setWelcomeSeen]=useState(false),[personalArrival,setPersonalArrival]=useState(false);
  const [selectedConnection, setSelectedConnection] =
    useState<Id<"connections">>();
  const knownConnections = useRef<Set<string> | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string>();
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(
    null,
  );
  useEffect(() => {
    const receive = (url: string | null | undefined) => {
      if (!url) return;
      const code = readIncomingInvite(url);
      if (code) {
        setPendingInviteCode(code);
        setTab("People");
      }
    };
    void Linking.getInitialURL()
      .then(receive)
      .catch(() => {});
    const subscription = Linking.addEventListener("url", ({ url }) =>
      receive(url),
    );
    return () => subscription.remove();
  }, []);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [graphCount, setGraphCount] = useState({
    nodes: demoGraph.nodes.length,
    edges: demoGraph.links.length,
  });
  const [search, setSearch] = useState("");
  const [day, setDay] = useState(1);
  const [filter, setFilter] = useState("all");
  const [sheet, setSheet] = useState<
    "interests" | "about" | "presentation" | "menu" | null
  >(null);
  const [draftTopics, setDraftTopics] = useState<string[]>(defaults.topicIds);
  const [selectedTalk, setSelectedTalk] = useState<Talk | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [toast, setToast] = useState("");
  const [orbitTopic, setOrbitTopic] = useState("all");
  const [intelligenceError, setIntelligenceError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [outboxRevision, setOutboxRevision] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authenticatedRef = useRef(false);
  const authAttempt = useRef<Promise<unknown> | null>(null);
  const outbox = useRef<Outbox>(emptyOutbox());
  const syncing = useRef(false);
  const intelligenceEnsured = useRef(false);
  const minimumInterestRevision = useRef(0);
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const connection = useConvexConnectionState();
  const [browserOnline, setBrowserOnline] = useState(
    () =>
      Platform.OS !== "web" ||
      typeof navigator === "undefined" ||
      navigator.onLine !== false,
  );
  const social = useQuery(api.social.mine, isAuthenticated ? {} : "skip");
  const discovery=useQuery(api.discover.mine,isAuthenticated?{}:'skip');
  useEffect(()=>{if(social&&!social.profile&&!welcomeSeen){setWelcome(true);setWelcomeSeen(true);}},[social,welcomeSeen]);
  const networkConnected = connection.isWebSocketConnected && browserOnline;
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const update = () => setBrowserOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const bootstrap = useAction(api.graph.bootstrap);
  const ensureIntelligence = useMutation(api.intelligence.ensure);
  const retryIntelligence = useMutation(api.intelligence.retry);
  const toggleBookmark = useMutation(api.preferences.toggleBookmark);
  const setInterests = useMutation(api.preferences.setInterests);
  const markMet = useMutation(api.preferences.markMet);
  const remotePrefs = useQuery(
    api.preferences.mine,
    isAuthenticated ? {} : "skip",
  );
  const intelligence = useQuery(
    api.intelligence.mine,
    isAuthenticated ? {} : "skip",
  );
  const presentation = useQuery(
    api.presentation.mine,
    isAuthenticated ? {} : "skip",
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);
  useEffect(() => {
    if (!social) return;
    const accepted = social.connections.filter((c) => c.status === "accepted");
    if (knownConnections.current) {
      const added = accepted.find((c) => !knownConnections.current!.has(c.id));
      if (added) notify(`You’re connected with ${added.name}`);
    }
    knownConnections.current = new Set(accepted.map((c) => c.id));
  }, [social?.networkRevision, notify]);
  const ensureAuth = useCallback(async () => {
    if (authenticatedRef.current) return;
    if (!authAttempt.current)
      authAttempt.current = (async () => {
        await signIn("anonymous");
        for (let i = 0; i < 20 && !authenticatedRef.current; i++)
          await new Promise((resolve) => setTimeout(resolve, 120));
        if (!authenticatedRef.current) throw new Error("Identity is not ready");
      })().finally(() => {
        authAttempt.current = null;
      });
    await authAttempt.current;
  }, [signIn]);
  useEffect(() => {
    authenticatedRef.current = isAuthenticated;
    if (!isAuthenticated) {
      intelligenceEnsured.current = false;
      minimumInterestRevision.current = 0;
      setIntelligenceError(false);
    }
  }, [isAuthenticated]);
  useEffect(() => {
    if (isAuthenticated && networkConnected && !intelligenceEnsured.current) {
      intelligenceEnsured.current = true;
      void ensureIntelligence({}).catch(() => setIntelligenceError(true));
    }
  }, [isAuthenticated, networkConnected, ensureIntelligence]);
  useEffect(() => {
    AsyncStorage.getItem(preferencesStorageKey)
      .then((value) => {
        if (value) {
          try {
            const stored = JSON.parse(value);
            if (
              Array.isArray(stored.bookmarks) &&
              Array.isArray(stored.topicIds) &&
              Array.isArray(stored.met)
            ) {
              setPrefs(cleanPreferences(stored));
              if (stored.outbox?.bookmarks && stored.outbox?.met)
                outbox.current = stored.outbox;
            }
          } catch {}
        }
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (hydrated)
      AsyncStorage.setItem(
        preferencesStorageKey,
        JSON.stringify({ ...prefs, outbox: outbox.current }),
      ).catch(() => {});
  }, [prefs, hydrated, outboxRevision]);
  useEffect(() => {
    if (remotePrefs && hydrated)
      setPrefs(overlay(cleanPreferences(remotePrefs), outbox.current));
  }, [remotePrefs, hydrated]);
  useEffect(() => {
    if (!isLoading && !isAuthenticated) ensureAuth().catch(() => {});
  }, [isLoading, isAuthenticated, ensureAuth]);
  useEffect(() => {
    let active = true;
    bootstrap({})
      .then((data) => {
        if (active) {
          setGraphCount(data.counts);
        }
      })
      .catch(() => {
        // Cached graph counts remain available; recommendation health is separate.
      });
    return () => {
      active = false;
    };
  }, [bootstrap]);
  const retryRecommendations = async () => {
    if (!networkConnected || retrying) return;
    if (outbox.current.topicIds !== null) {
      notify("Wait for your interests to sync before retrying.");
      return;
    }
    setRetrying(true);
    setIntelligenceError(false);
    minimumInterestRevision.current = Math.max(
      minimumInterestRevision.current,
      (remotePrefs?.revision ?? prefs.revision) + 1,
    );
    try {
      await ensureAuth();
      await retryIntelligence({});
    } catch {
      setIntelligenceError(true);
      notify("Recommendations are unavailable. Reconnect and retry.");
    } finally {
      setRetrying(false);
    }
  };

  const flushOutbox = useCallback(async () => {
    if (syncing.current) return false;
    syncing.current = true;
    try {
      await ensureAuth();
      let rounds = 0;
      do {
        const server = await convex.query(api.preferences.mine, {});
        for (const [talkId, desired] of Object.entries({
          ...outbox.current.bookmarks,
        })) {
          if (server.bookmarks.includes(talkId) !== desired)
            await toggleBookmark({ talkId });
          if (outbox.current.bookmarks[talkId] === desired)
            delete outbox.current.bookmarks[talkId];
        }
        for (const [personId, desired] of Object.entries({
          ...outbox.current.met,
        })) {
          if (server.met.includes(personId) !== desired)
            await markMet({ personId });
          if (outbox.current.met[personId] === desired)
            delete outbox.current.met[personId];
        }
        const desiredTopics = outbox.current.topicIds;
        if (desiredTopics) {
          const committedRevision = await setInterests({
            topicIds: desiredTopics,
          });
          minimumInterestRevision.current = Math.max(
            minimumInterestRevision.current,
            committedRevision,
          );
          if (outbox.current.topicIds === desiredTopics)
            outbox.current.topicIds = null;
        }
        rounds++;
      } while (
        rounds < 10 &&
        (Object.keys(outbox.current.bookmarks).length ||
          Object.keys(outbox.current.met).length ||
          outbox.current.topicIds)
      );
      return true;
    } catch {
      return false;
    } finally {
      syncing.current = false;
      setOutboxRevision((revision) => revision + 1);
    }
  }, [ensureAuth, toggleBookmark, markMet, setInterests]);
  useEffect(() => {
    if (
      hydrated &&
      isAuthenticated &&
      networkConnected &&
      (Object.keys(outbox.current.bookmarks).length ||
        Object.keys(outbox.current.met).length ||
        outbox.current.topicIds)
    )
      void flushOutbox();
  }, [hydrated, isAuthenticated, networkConnected, flushOutbox]);
  const persistChange = (message: string) => {
    setOutboxRevision((revision) => revision + 1);
    if (!networkConnected) {
      notify(`${message} · saved on this device`);
      return;
    }
    void flushOutbox().then((synced) =>
      notify(synced ? message : `${message} · saved on this device`),
    );
  };
  const saveTalk = (talk: Talk) => {
    const saved = prefs.bookmarks.includes(talk.id);
    outbox.current.bookmarks[talk.id] = !saved;
    setPrefs((p) => ({
      ...p,
      bookmarks: saved
        ? p.bookmarks.filter((id) => id !== talk.id)
        : [...p.bookmarks, talk.id],
    }));
    persistChange(saved ? "Removed from your plan" : "Added to your plan");
  };
  const connectPerson = (person: Person) => {
    const met = prefs.met.includes(person.id);
    outbox.current.met[person.id] = !met;
    setPrefs((p) => ({
      ...p,
      met: met ? p.met.filter((id) => id !== person.id) : [...p.met, person.id],
    }));
    persistChange(
      met
        ? "Connection removed"
        : `${person.name.split(" ")[0]} saved to your demo circle`,
    );
  };
  const openInterests = () => {
    setDraftTopics(prefs.topicIds);
    setSheet("interests");
  };
  const saveInterests = () => {
    const topicIds = [...draftTopics];
    outbox.current.topicIds = topicIds;
    setPrefs((p) => ({ ...p, topicIds }));
    setSheet(null);
    persistChange("Your universe, tuned to you");
  };
  const explainTalk = (talk: Talk) => {
    if (!talk.topicIds.length) {
      notify("No official topic is listed for this event");
      return;
    }
    setProof({
      title: talk.title,
      kind: "session",
      targetId: talk.id,
    });
  };
  const explainPerson = (person: Person) => {
    setProof({
      title: person.name,
      kind: "person",
      targetId: person.id,
    });
  };
  const interestsPending =
    outbox.current.topicIds !== null ||
    (!!remotePrefs && !sameTopics(prefs.topicIds, remotePrefs.topicIds));
  const revisionMatches =
    hydrated &&
    !!remotePrefs &&
    !!intelligence &&
    remotePrefs.revision >= minimumInterestRevision.current &&
    intelligence.revision === remotePrefs.revision &&
    !interestsPending;
  const serverRecommendationsReady =
    revisionMatches && intelligence?.status === "ready";
  const recommendationsLive =
    !!serverRecommendationsReady &&
    !retrying &&
    !intelligenceError &&
    networkConnected &&
    intelligence?.source === "live";
  const recommendationLabel = recommendationsLive
    ? "Personalized for you"
    : !networkConnected
      ? "Preview · disconnected"
      : interestsPending
        ? "Preview · interests pending sync"
        : intelligenceError || intelligence?.status === "error"
          ? "Preview · recommendations unavailable"
          : intelligence?.status === "loading" || retrying
            ? "Preview · updating recommendations"
            : !revisionMatches || intelligence?.status === "idle"
              ? "Preview · preparing recommendations"
              : "Preview · saved recommendations";
  const matchingTalks = serverRecommendationsReady
    ? [...new Set(intelligence.talks.map((record) => record.talkId))]
        .map((id) => talks.find((talk) => talk.id === id))
        .filter((talk): talk is Talk => !!talk)
    : talks.filter((talk) =>
        talk.topicIds.some((id) => prefs.topicIds.includes(id)),
      );
  const matchingPeople = serverRecommendationsReady
    ? [
        ...new Set(
          intelligence.people.map((record) =>
            record.personId.replace("demo:", ""),
          ),
        ),
      ]
        .map((id) => people.find((person) => person.id === id))
        .filter((person): person is Person => !!person)
    : people.filter((person) =>
        person.topicIds.some((id) => prefs.topicIds.includes(id)),
      );
  const featuredTalk =
    matchingTalks.find((t) => t.day === 1 && t.featured) || matchingTalks[0];
  const visibleTalks = talks.filter(
    (t) =>
      t.day === day &&
      (filter === "all" || t.topicIds.includes(filter)) &&
      `${t.title} ${speakerOf(t).name} ${t.track}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const visiblePeople = people.filter((p) =>
    `${p.name} ${p.company} ${p.role} ${p.city}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const savedTalks = talks.filter((t) => prefs.bookmarks.includes(t.id));
  const orbitPeople = people.filter(
    (p) => orbitTopic === "all" || p.topicIds.includes(orbitTopic),
  );
  const changeTab = (next: Tab) => {
    if(next==='Orbit')setHomeVisit(v=>v+1);
    pageScroll.current?.scrollTo({y:0,animated:false});
    setTab(next);
    setSearch("");
    setFilter("all");
  };
  const closeSheets = () => {
    setSheet(null);
    setSelectedTalk(null);
    setSelectedPerson(null);
    setProof(null);
  };
  const selectedRecommendation =
    serverRecommendationsReady && proof
      ? proof.kind === "session"
        ? intelligence.talks.find((record) => record.talkId === proof.targetId)
        : intelligence.people.find(
            (record) => record.personId.replace("demo:", "") === proof.targetId,
          )
      : undefined;
  const selectedGraphProof = selectedRecommendation?.proof;
  const proofIsLive = recommendationsLive && !!selectedGraphProof;

  return (
    <View style={s.stage}>
      {welcome && <WelcomeFlow connected={networkConnected} profileReady={!!social?.profile} onClose={personal=>{setWelcome(false);setPersonalArrival(personal);setTab('Orbit');}}/>}
      {captureTarget && (
        <CaptureStudio
          target={captureTarget}
          connected={networkConnected}
          onClose={() => setCaptureTarget(null)}
        />
      )}
      <View style={[s.app, { width: Math.min(width, 520) }]}>
        <StatusBar style="light" />
        <LinearGradient
          pointerEvents="none"
          colors={["#2c234040", "#10121c00"]}
          style={[StyleSheet.absoluteFill, { height: 430 }]}
        />
        <View
          style={{ height: Math.max(inset.top, 16), backgroundColor: C.bg }}
        />
        <View style={s.topbar}>
          <Pressable
            onPress={() => setSheet("about")}
            style={s.wordmark}
            accessibilityLabel="About ConferenceOS"
          >
            <View style={s.logo}>
              <Icon name="planet-outline" size={21} color={C.lime} />
            </View>
            <Text style={s.brand}>
              conference<Text style={{ fontWeight: "400" }}>os</Text>
              <Text style={{ color: "#a49ab5" }}>.</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSheet("menu")}
            style={s.avatarSmall}
            accessibilityLabel="Open your profile and settings"
          >
            <Portrait
              node={{
                id: "me",
                name: social?.profile?.name || "You",
                color: social?.profile?.color || "#bca5ef",
              }}
              size={34}
            />
            <View style={s.avatarDot} />
          </Pressable>
        </View>
        <ScrollView
          ref={pageScroll}
          key={tab}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.content,
            { paddingBottom: 115 + inset.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Reveal key={tab}>
            {(tab === "Sessions" || tab === "Plan") && (
              <View style={s.discoverTabs}>
                <Pressable
                  style={[
                    s.discoverTab,
                    tab === "Sessions" && s.discoverTabActive,
                  ]}
                  onPress={() => changeTab("Sessions")}
                >
                  <Text style={s.discoverTabText}>Explore</Text>
                </Pressable>
                <Pressable
                  style={[s.discoverTab, tab === "Plan" && s.discoverTabActive]}
                  onPress={() => changeTab("Plan")}
                >
                  <Icon name="bookmark-outline" size={15} />
                  <Text style={s.discoverTabText}>
                    Saved · {prefs.bookmarks.length}
                  </Text>
                </Pressable>
              </View>
            )}
            {tab === "Sessions" && (
              <>
                <PageHeading
                  eyebrow="YOUR TIME, WELL SPENT"
                  title={"Be in the right room."}
                  description="A few good reasons to go."
                />
                {!!discovery?.items.length&&!search&&<View style={{marginBottom:24}}><Text style={[s.eyebrow,{marginVertical:16}]}>PICKED FOR YOUR CONTEXT</Text>{discovery.items.slice(0,3).map((item,index)=>{const talk=talks.find(t=>t.id===item.talkId);return talk?<SessionCard key={talk.id} talk={talk} featured={index===0} reason={item.reason} saved={prefs.bookmarks.includes(talk.id)} onSave={()=>saveTalk(talk)} onOpen={()=>setSelectedTalk(talk)} onExplain={()=>explainTalk(talk)}/>:null;})}</View>}
                <Search
                  value={search}
                  onChange={setSearch}
                  placeholder="Search sessions, speakers, topics"
                />
                <View style={s.dayTabs}>
                  {[1, 2].map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setDay(d)}
                      style={[s.dayTab, day === d && s.dayTabActive]}
                    >
                      <Text
                        style={[s.dayTabText, day === d && { color: C.bg }]}
                      >
                        DAY 0{d}
                      </Text>
                      <Text
                        style={[
                          s.dayTabDate,
                          day === d && { color: "#50475d" },
                        ]}
                      >
                        October {27 + d}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.filterRow}
                >
                  <Chip
                    label="All topics"
                    active={filter === "all"}
                    onPress={() => setFilter("all")}
                  />
                  {topics.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.name}
                      color={t.color}
                      active={filter === t.id}
                      onPress={() => setFilter(t.id)}
                    />
                  ))}
                </ScrollView>
                <View style={s.resultsHead}>
                  <Text style={s.eyebrow}>
                    {visibleTalks.length} SESSIONS TO DISCOVER
                  </Text>
                  <Text style={s.resultsHint}>All times PDT</Text>
                </View>
                {visibleTalks.map((talk) => (
                  <SessionCard
                    key={talk.id}
                    talk={talk}
                    saved={prefs.bookmarks.includes(talk.id)}
                    onSave={() => saveTalk(talk)}
                    onOpen={() => setSelectedTalk(talk)}
                    onExplain={() => explainTalk(talk)}
                  />
                ))}
                {!visibleTalks.length && (
                  <Empty
                    icon="search-outline"
                    title="A little too specific?"
                    message="Try another topic or a different search."
                  />
                )}
                <Text style={s.demoNote}>
                  {talks.length} official schedule occurrences. Synced from
                  GitHub Universe. Open each session’s source for the latest
                  program.
                </Text>
              </>
            )}

            {tab === "People" && (
              <NetworkPage
                authenticated={isAuthenticated}
                connected={networkConnected}
                onNotify={notify}
                initialConnectionId={selectedConnection}
                pendingInviteCode={pendingInviteCode}
              />
            )}
            {tab==='Feed'&&<FeedPage authenticated={isAuthenticated} connected={networkConnected}/>}

            {tab === "Plan" && (
              <>
                <PageHeading
                  eyebrow="MAKE ROOM FOR WHAT MATTERS"
                  title={"Your kind of day."}
                  description="Your sessions, your connections, your kind of day."
                />
                <View style={s.planStats}>
                  <View style={s.planStat}>
                    <Text style={s.planNumber}>
                      {String(savedTalks.length).padStart(2, "0")}
                    </Text>
                    <Text style={s.planStatLabel}>sessions saved</Text>
                  </View>
                  <View style={s.planStatDivider} />
                  <View style={s.planStat}>
                    <Text style={s.planNumber}>
                      {String(prefs.met.length).padStart(2, "0")}
                    </Text>
                    <Text style={s.planStatLabel}>demo connections</Text>
                  </View>
                  <View style={s.planStatSpark}>
                    <Icon name="sparkles-outline" size={26} />
                  </View>
                </View>
                {savedTalks.length ? (
                  [1, 2].map((d) => (
                    <View key={d}>
                      {savedTalks.some((t) => t.day === d) && (
                        <View style={s.timelineDate}>
                          <View style={s.tinyDot} />
                          <Text style={s.timelineDateText}>
                            DAY 0{d} · OCTOBER {27 + d}
                          </Text>
                        </View>
                      )}
                      {savedTalks
                        .filter((t) => t.day === d)
                        .map((talk) => (
                          <SessionCard
                            key={talk.id}
                            talk={talk}
                            saved
                            onSave={() => saveTalk(talk)}
                            onOpen={() => setSelectedTalk(talk)}
                            onExplain={() => explainTalk(talk)}
                          />
                        ))}
                    </View>
                  ))
                ) : (
                  <View style={s.emptyPlan}>
                    <View style={s.emptyPlanArt}>
                      <Icon name="bookmark-outline" size={39} />
                      <View style={s.smallSpark}>
                        <Icon name="add" size={18} />
                      </View>
                    </View>
                    <Text style={s.emptyTitle}>A good day starts here.</Text>
                    <Text style={s.emptyDescription}>
                      Save a session that catches your eye.{"\n"}We’ll keep your
                      plans in one place.
                    </Text>
                    <Action
                      label="Find your first session"
                      icon="arrow-forward"
                      onPress={() => changeTab("Sessions")}
                    />
                  </View>
                )}
                {!!prefs.met.length && (
                  <>
                    <View style={s.sectionHead}>
                      <Text style={s.sectionTitle}>Your growing circle</Text>
                    </View>
                    {people
                      .filter((p) => prefs.met.includes(p.id))
                      .map((person) => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          met
                          onOpen={() => setSelectedPerson(person)}
                          onExplain={() => explainPerson(person)}
                        />
                      ))}
                  </>
                )}
                <View style={s.planTip}>
                  <Icon name="leaf-outline" size={22} />
                  <Text style={s.planTipText}>
                    Leave a little space for the unexpected.{"\n"}The best
                    connections rarely need a calendar.
                  </Text>
                </View>
              </>
            )}

            {tab === "Orbit" && (
              <OrbitHome
                homeVisit={homeVisit}
                onConversation={()=>setCaptureTarget({kind:'conversation',title:'A good conversation',recordFirst:true})}
                width={Math.min(width, 520)}
                personalNodes={(social?.connections || [])
                  .filter((c) => c.status === "accepted")
                  .map((c) => ({ id: c.id, name: c.name, color: c.color }))}
                onPerson={(id) => {
                  setSelectedConnection(
                    social?.connections.find((c) => c.id === id)?.id,
                  );
                  changeTab("People");
                }}
                onSpeaker={(id) => {
                  const talk = talks.find((t) => t.speakerIds.includes(id));
                  if (talk) setSelectedTalk(talk);
                }}
                onNetwork={() => changeTab("People")}
                onDiscover={() => changeTab("Sessions")}
                connected={networkConnected}
                authenticated={isAuthenticated}
              />
            )}
          </Reveal>
        </ScrollView>

        <LinearGradient
          colors={["#10121c00", C.bg, C.bg]}
          style={[s.navFade, { height: 104 + inset.bottom }]}
          pointerEvents="none"
        />
        <View style={[s.bottomNav, { bottom: Math.max(inset.bottom, 14) }]}>
          {(
            [
              {
                name: "Orbit",
                label: "Home",
                icon: "planet-outline",
                active: "planet",
              },
              {
                name: "Sessions",
                label: "Discover",
                icon: "compass-outline",
                active: "compass",
              },
              {
                name: "People",
                label: "Network",
                icon: "people-outline",
                active: "people",
              },
              {
                name: "Feed",
                label: "Feed",
                icon: "newspaper-outline",
                active: "newspaper",
              },
            ] as const
          ).map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{
                selected:
                  tab === item.name ||
                  (tab === "Plan" && item.name === "Sessions"),
              }}
              aria-selected={tab === item.name}
              accessibilityLabel={item.label}
              onPress={() => changeTab(item.name)}
              key={item.name}
              style={({ pressed }) => [
                s.navItem,
                (tab === item.name ||
                  (tab === "Plan" && item.name === "Sessions")) &&
                  s.navItemActive,
                { transform: [{ scale: pressed ? 0.94 : 1 }] },
              ]}
            >
              <Icon
                name={tab === item.name ? item.active : item.icon}
                size={21}
                color={tab === item.name ? C.ink : "#778076"}
              />
              <Text style={[s.navText, tab === item.name && s.navTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {!!toast && (
          <View
            pointerEvents="none"
            style={[s.toast, { bottom: 102 + inset.bottom }]}
          >
            <Icon name="checkmark-circle" size={19} color={C.lime} />
            <Text style={s.toastText}>{toast}</Text>
          </View>
        )}

        <Modal
          transparent
          visible={!!sheet || !!selectedTalk || !!selectedPerson || !!proof}
          animationType="fade"
          onRequestClose={closeSheets}
          statusBarTranslucent
        >
          <View style={s.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeSheets}
              accessibilityLabel="Close details"
            />
            <Sheet
              visible={sheet === "menu"}
              onClose={() => setSheet(null)}
              title="Your space."
              eyebrow="PRIVATE BY DEFAULT"
            >
              <Pressable
                style={s.menuRow}
                onPress={() => {
                  setSheet(null);
                  changeTab("People");
                }}
              >
                <Icon name="person-circle-outline" size={24} />
                <Text style={s.menuText}>Profile & connections</Text>
                <Icon name="chevron-forward" size={17} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Start fresh demo profile" style={s.menuRow} disabled={!networkConnected || syncing.current} onPress={onNewProfile}>
                <Icon name="person-add-outline" size={23}/>
                <Text style={s.menuText}>Start fresh demo profile</Text>
                <Icon name="chevron-forward" size={17}/>
              </Pressable>
              <Text style={{fontSize:12,lineHeight:19,color:C.muted,marginBottom:12}}>A separate profile for your demo recording. Your original profile is kept. A call starts only when you tap Call me.</Text>
              {!originalProfile && <Pressable accessibilityRole="button" accessibilityLabel="Return to original profile" style={s.menuRow} onPress={onOriginalProfile}>
                <Icon name="arrow-undo-outline" size={23}/><Text style={s.menuText}>Return to original profile</Text>
              </Pressable>}
              <Pressable style={s.menuRow} onPress={openInterests}>
                <Icon name="options-outline" size={23} />
                <Text style={s.menuText}>Tune session interests</Text>
                <Icon name="chevron-forward" size={17} />
              </Pressable>
              <PresentationSummary
                session={presentation}
                connected={isAuthenticated && networkConnected}
                onOpen={() => setSheet("presentation")}
              />
              {desktopGraphUrl && (
                <Pressable
                  style={s.menuRow}
                  onPress={() =>
                    void Linking.openURL(desktopGraphUrl).catch(() =>
                      notify("Could not open desktop"),
                    )
                  }
                >
                  <Icon name="laptop-outline" size={22} />
                  <Text style={s.menuText}>Open desktop universe</Text>
                  <Icon name="arrow-up-right" size={17} />
                </Pressable>
              )}
              <Pressable style={s.menuRow} onPress={() => setSheet("about")}>
                <Icon name="information-circle-outline" size={23} />
                <Text style={s.menuText}>About & data sources</Text>
                <Icon name="chevron-forward" size={17} />
              </Pressable>
            </Sheet>
            <Sheet
              visible={sheet === "presentation"}
              onClose={() => setSheet(null)}
              title="A bigger canvas."
              eyebrow="PUBLIC PATH PRESENTATION"
            >
              {sheet === "presentation" && (
                <PresentationConsent
                  session={presentation}
                  connected={isAuthenticated && networkConnected}
                  onNotify={notify}
                  onRetry={() => void retryRecommendations()}
                />
              )}
            </Sheet>
            <Sheet
              visible={sheet === "interests"}
              onClose={() => setSheet(null)}
              title="Follow your curiosity."
              eyebrow="MAKE THIS UNIVERSE YOURS"
            >
              <Text style={s.sheetDescription}>
                Choose the ideas you can’t stop thinking about. We’ll find the
                sessions and people that connect.
              </Text>
              <View style={s.interestGrid}>
                {topics.map((topic) => {
                  const selected = draftTopics.includes(topic.id);
                  return (
                    <Pressable
                      key={topic.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      aria-checked={selected}
                      accessibilityLabel={topic.name}
                      onPress={() =>
                        setDraftTopics((ids) =>
                          selected
                            ? ids.filter((id) => id !== topic.id)
                            : [...ids, topic.id],
                        )
                      }
                      style={[
                        s.interestOption,
                        selected && {
                          backgroundColor: topic.color,
                          borderColor: topic.color,
                        },
                      ]}
                    >
                      <Icon
                        name={
                          topic.id === "ai"
                            ? "sparkles-outline"
                            : topic.id === "graph"
                              ? "git-network-outline"
                              : topic.id === "security"
                                ? "shield-checkmark-outline"
                                : topic.id === "platform"
                                  ? "layers-outline"
                                  : topic.id === "opensource"
                                    ? "code-slash-outline"
                                    : "happy-outline"
                        }
                        size={26}
                      />
                      <Text
                        style={[
                          s.interestOptionText,
                          selected && { color: "#30253e" },
                        ]}
                      >
                        {topic.name}
                      </Text>
                      <View
                        style={[
                          s.interestCheck,
                          selected && {
                            backgroundColor: C.ink,
                            borderColor: C.ink,
                          },
                        ]}
                      >
                        {selected && (
                          <Icon name="checkmark" size={13} color={C.white} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.interestCount}>
                {draftTopics.length} of 6 interests selected
              </Text>
              <Action
                label="Find my connections"
                icon="arrow-forward"
                onPress={saveInterests}
              />
              <Text style={s.sheetFootnote}>
                Your interests are private to your anonymous demo profile.
              </Text>
            </Sheet>

            <Sheet
              visible={!!selectedTalk}
              onClose={() => setSelectedTalk(null)}
              title={selectedTalk?.title || ""}
              eyebrow={
                selectedTalk
                  ? `DAY 0${selectedTalk.day} · ${selectedTalk.format.toUpperCase()}`
                  : ""
              }
            >
              {selectedTalk && (
                <>
                  <Action
                    label="Capture this session"
                    icon="mic-outline"
                    onPress={() => {
                      setCaptureTarget({
                        kind: "session",
                        title: selectedTalk.title,
                        talkId: selectedTalk.id,
                      });
                      setSelectedTalk(null);
                    }}
                  />
                  <View
                    style={[
                      s.sessionDetailArt,
                      { backgroundColor: selectedTalk.color },
                    ]}
                  >
                    <SessionArt
                      size={155}
                      variant={selectedTalk.topicIds[0] || "event"}
                    />
                    <View style={s.detailTrack}>
                      <Text style={s.detailTrackText}>
                        {selectedTalk.track || selectedTalk.format}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.sheetDescription}>
                    {selectedTalk.subtitle ||
                      "The official program has not published a description for this event. Open the source schedule for the latest details."}
                  </Text>
                  <View style={s.detailMeta}>
                    <View style={s.detailMetaItem}>
                      <Icon name="time-outline" size={19} />
                      <Text style={s.detailMetaText}>
                        {selectedTalk.time} – {selectedTalk.end} PDT
                      </Text>
                    </View>
                    <View style={s.detailMetaItem}>
                      <Icon name="location-outline" size={19} />
                      <Text style={s.detailMetaText}>
                        {roomOf(selectedTalk)}
                      </Text>
                    </View>
                  </View>
                  {presentersOf(selectedTalk).length ? (
                    presentersOf(selectedTalk).map((presenter) => (
                      <View key={presenter.id} style={s.speakerDetail}>
                        <Avatar person={presenter} size={48} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.personName}>{presenter.name}</Text>
                          <Text style={s.personRole}>
                            {[presenter.role, presenter.company]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </View>
                        <Text style={s.speakerTag}>SPEAKER</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[s.personRole, { marginBottom: 20 }]}>
                      No presenter listed in the official program.
                    </Text>
                  )}
                  <Action
                    label={
                      prefs.bookmarks.includes(selectedTalk.id)
                        ? "Saved to your plan"
                        : "Add to my plan"
                    }
                    icon={
                      prefs.bookmarks.includes(selectedTalk.id)
                        ? "checkmark"
                        : "add"
                    }
                    onPress={() => saveTalk(selectedTalk)}
                  />
                  {!!selectedTalk.topicIds.length && (
                    <Pressable
                      style={s.sheetSecondary}
                      onPress={() => {
                        explainTalk(selectedTalk);
                        setSelectedTalk(null);
                      }}
                    >
                      <Icon name="git-network-outline" size={18} />
                      <Text style={s.sheetSecondaryText}>
                        Why this session connects to you
                      </Text>
                      <Icon name="arrow-forward" size={17} />
                    </Pressable>
                  )}
                  <Pressable
                    style={s.sheetSecondary}
                    accessibilityLabel="Open official session source"
                    onPress={() =>
                      void Linking.openURL(selectedTalk.sourceUrl).catch(() =>
                        notify("Could not open the official source"),
                      )
                    }
                  >
                    <Icon name="open-outline" size={18} />
                    <Text style={s.sheetSecondaryText}>
                      View official schedule & source
                    </Text>
                    <Icon name="arrow-up-right" size={17} />
                  </Pressable>
                  <Text style={s.sheetFootnote}>
                    Official GitHub Universe program · fetched{" "}
                    {new Date(
                      officialProgramSource.fetchedAt,
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    . Check the source for schedule changes.
                  </Text>
                </>
              )}
            </Sheet>

            <Sheet
              visible={!!selectedPerson}
              onClose={() => setSelectedPerson(null)}
              title=""
              eyebrow="A HELLO AWAY FROM SOMETHING GOOD"
            >
              {selectedPerson && (
                <>
                  <View style={s.profileHeader}>
                    <View style={s.profileAvatarWrap}>
                      <Avatar person={selectedPerson} size={96} />
                      <View style={s.profileSpark}>
                        <Icon name="sparkles" size={19} />
                      </View>
                    </View>
                    <Text style={s.profileName}>{selectedPerson.name}</Text>
                    <Text style={s.profileRole}>
                      {selectedPerson.role} · {selectedPerson.company}
                    </Text>
                    <Text style={[s.personCity, { marginTop: 9 }]}>
                      Public self-report · attendance unconfirmed
                    </Text>
                    <View style={s.profileLocation}>
                      <Icon name="location-outline" size={14} />
                      <Text style={s.profileLocationText}>
                        {selectedPerson.city}
                      </Text>
                      <View style={s.profileDemoPill}>
                        <Text style={s.profileDemoText}>DEMO PROFILE</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.profileBio}>
                    <Text style={s.profileBioLabel}>
                      PUBLIC PROFESSIONAL TOPICS
                    </Text>
                    <Text style={s.profileBioText}>
                      Public profile snippets and professional posts mention{" "}
                      {profileSourcesById[
                        selectedPerson.id
                      ]?.professionalTopics.join(", ") ||
                        "the professional subjects shown on the linked profile"}
                      . Roles and affiliations are public self-reports and may
                      be stale.
                    </Text>
                  </View>
                  <Text style={[s.eyebrow, { marginBottom: 10 }]}>
                    SYNTHETIC DEMO MATCH INTERESTS
                  </Text>
                  <View style={s.profileTopics}>
                    {selectedPerson.topicIds.map((id) => (
                      <Chip
                        key={id}
                        label={topicOf(id).name}
                        color={topicOf(id).color}
                        active
                        onPress={() => {
                          setSelectedPerson(null);
                          setOrbitTopic(id);
                          changeTab("Orbit");
                        }}
                      />
                    ))}
                  </View>
                  <Action
                    label={
                      prefs.met.includes(selectedPerson.id)
                        ? "Demo connection saved · tap to remove"
                        : "Save demo connection"
                    }
                    icon={
                      prefs.met.includes(selectedPerson.id)
                        ? "checkmark"
                        : "person-add-outline"
                    }
                    onPress={() => connectPerson(selectedPerson)}
                  />
                  <Pressable
                    style={s.sheetSecondary}
                    accessibilityLabel="Open public LinkedIn profile"
                    onPress={() =>
                      void Linking.openURL(
                        profileSourcesById[selectedPerson.id].profileUrl,
                      ).catch(() => notify("Could not open the public profile"))
                    }
                  >
                    <Icon name="logo-linkedin" size={18} />
                    <Text style={s.sheetSecondaryText}>
                      View public LinkedIn profile
                    </Text>
                    <Icon name="arrow-up-right" size={17} />
                  </Pressable>
                  {profileSourcesById[selectedPerson.id]?.hiring.status ===
                    "public-post-found" && (
                    <View style={s.profileBio}>
                      <Text style={s.profileBioLabel}>
                        PUBLIC HIRING POST · CURRENT OPENINGS UNVERIFIED
                      </Text>
                      <Text style={s.profileBioText}>
                        {profileSourcesById[selectedPerson.id].hiring.note}
                      </Text>
                      <Pressable
                        style={[s.textLink, { marginTop: 10 }]}
                        onPress={() =>
                          void Linking.openURL(
                            profileSourcesById[selectedPerson.id].hiring
                              .sourceUrl!,
                          ).catch(() =>
                            notify("Could not open the hiring post"),
                          )
                        }
                      >
                        <Text style={s.textLinkText}>
                          Read the public hiring post
                        </Text>
                        <Icon name="arrow-up-right" size={15} />
                      </Pressable>
                    </View>
                  )}
                  <Text style={[s.eyebrow, { marginBottom: 12 }]}>
                    PUBLIC EVIDENCE & PROVENANCE
                  </Text>
                  {profileSourcesById[selectedPerson.id]?.sources.map(
                    (source, index) => (
                      <Pressable
                        key={source.url}
                        style={s.aboutInfo}
                        onPress={() =>
                          void Linking.openURL(source.url).catch(() =>
                            notify("Could not open this source"),
                          )
                        }
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.interestTitle}>
                            {index + 1}. {source.kind.replaceAll("-", " ")}
                          </Text>
                          <Text style={s.aboutDescription}>
                            {source.summary}
                          </Text>
                          <Text style={s.personCity}>
                            {source.access === "search-index"
                              ? "Public search index"
                              : "Direct public page"}{" "}
                            · crawled {source.crawlRecency}
                          </Text>
                        </View>
                        <Icon name="arrow-up-right" size={17} />
                      </Pressable>
                    ),
                  )}
                  <Pressable
                    style={s.sheetSecondary}
                    onPress={() => {
                      explainPerson(selectedPerson);
                      setSelectedPerson(null);
                    }}
                  >
                    <Icon name="git-network-outline" size={18} />
                    <Text style={s.sheetSecondaryText}>
                      See how you’re connected
                    </Text>
                    <Icon name="arrow-forward" size={17} />
                  </Pressable>
                  <Text style={s.sheetFootnote}>
                    Attendance is unconfirmed. Demo interests and relationships
                    are synthetic. City labels come from public profile
                    metadata, not location tracking. Saving a demo connection is
                    private and sends no message.
                  </Text>
                </>
              )}
            </Sheet>

            <Sheet
              visible={!!proof}
              onClose={() => setProof(null)}
              title={
                selectedGraphProof
                  ? "A connection with a reason."
                  : "Preview · no returned path."
              }
              eyebrow="FOLLOW THE THREAD"
            >
              {proof && (
                <>
                  <Text style={s.sheetDescription}>
                    {selectedGraphProof
                      ? proof.kind === "session"
                        ? "These are the exact nodes and directed links returned by the server for this saved interest revision."
                        : "This private path uses synthetic demo interests. It does not establish attendance or a real relationship, and it is excluded from desktop sharing."
                      : "No current server proof is available for this selection. Browse its details or retry recommendations. Preview matches do not establish a graph connection."}
                  </Text>
                  <View style={[s.profileBio, { marginBottom: 15 }]}>
                    <Text style={s.profileBioLabel}>
                      PRIVATE CONTEXT · NOT A GRAPH NODE
                    </Text>
                    <Text style={s.profileBioText}>
                      Your interests:{" "}
                      {prefs.topicIds
                        .map((id) => topicOf(id).name)
                        .join(", ") || "none selected"}
                      .{" "}
                      {interestsPending
                        ? "Changes are still waiting to sync."
                        : `Saved revision ${remotePrefs?.revision ?? prefs.revision}.`}
                    </Text>
                  </View>
                  {selectedGraphProof ? (
                    <ExactProofPath proof={selectedGraphProof} />
                  ) : (
                    <RecommendationNotice
                      label={recommendationLabel}
                      live={false}
                      pending={interestsPending}
                      loading={intelligence?.status === "loading" || retrying}
                      connected={networkConnected}
                      onRetry={() => void retryRecommendations()}
                    />
                  )}
                  <View style={s.proofSource}>
                    <View
                      style={[
                        s.tinyDot,
                        {
                          backgroundColor: proofIsLive ? "#6b9b45" : "#c69c50",
                        },
                      ]}
                    />
                    <Text style={s.proofSourceText}>
                      {proofIsLive
                        ? "Based on your saved interests and this session’s topics"
                        : selectedGraphProof
                          ? "Preview · cached server proof; live status unconfirmed"
                          : "Preview · no live proof claimed"}
                    </Text>
                  </View>
                  <Action
                    label={
                      proof.kind === "session"
                        ? "Explore this session"
                        : "Meet this person"
                    }
                    icon="arrow-forward"
                    onPress={() => {
                      if (proof.kind === "session")
                        setSelectedTalk(
                          talks.find((t) => t.id === proof.targetId)!,
                        );
                      else
                        setSelectedPerson(
                          people.find((p) => p.id === proof.targetId)!,
                        );
                      setProof(null);
                    }}
                  />
                </>
              )}
            </Sheet>

            <Sheet
              visible={sheet === "about"}
              onClose={() => setSheet(null)}
              title="Good things connect."
              eyebrow="OFFICIAL PROGRAM · SOURCED DEMO PEOPLE"
            >
              <Text style={s.sheetDescription}>
                A personal conference companion, built around the connections
                between people, sessions, and the things that make you curious.
              </Text>
              <View style={s.aboutStats}>
                <View>
                  <Text style={s.aboutNumber}>{graphCount.nodes}</Text>
                  <Text style={s.personRole}>graph nodes</Text>
                </View>
                <View>
                  <Text style={s.aboutNumber}>{graphCount.edges}</Text>
                  <Text style={s.personRole}>connections</Text>
                </View>
                <View>
                  <Text style={s.aboutNumber}>{talks.length}</Text>
                  <Text style={s.personRole}>sessions</Text>
                </View>
              </View>
              <View style={s.aboutInfo}>
                <Icon
                  name={
                    recommendationsLive
                      ? "checkmark-circle-outline"
                      : "cloud-offline-outline"
                  }
                  size={24}
                  color={C.ink}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.interestTitle}>{recommendationLabel}</Text>
                  <Text style={s.aboutDescription}>
                    {recommendationsLive
                      ? `The server’s recommendations match saved interest revision ${remotePrefs?.revision}. Your plan and interests sync privately through Convex.`
                      : "Saved program matches are explicitly previews while recommendations are loading, disconnected, unavailable, or waiting for your latest interests."}
                  </Text>
                </View>
              </View>
              {!recommendationsLive && (
                <RecommendationNotice
                  label={recommendationLabel}
                  live={false}
                  pending={interestsPending}
                  loading={intelligence?.status === "loading" || retrying}
                  connected={networkConnected}
                  onRetry={() => void retryRecommendations()}
                />
              )}
              <Text style={s.aboutBody}>
                The official GitHub Universe program supplies {talks.length}{" "}
                scheduled occurrences, {speakers.length} speakers, and{" "}
                {rooms.length} rooms. Fetched{" "}
                {new Date(officialProgramSource.fetchedAt).toLocaleDateString(
                  "en-US",
                )}
                . The six people are demo personas based on supplied public
                profile URLs, with unconfirmed attendance and synthetic
                interests and conference relationships. ConferenceOS is an
                independent prototype.
              </Text>
              <Action
                label="View the official source schedule"
                icon="arrow-up-right"
                onPress={() => {
                  void Linking.openURL(officialProgramSource.catalogUrl).catch(
                    () => notify("Could not open event website"),
                  );
                }}
              />
              <Pressable
                style={s.sheetSecondary}
                onPress={() => {
                  setSheet(null);
                  changeTab("Orbit");
                }}
              >
                <Icon name="planet-outline" size={18} />
                <Text style={s.sheetSecondaryText}>
                  Explore the mobile graph
                </Text>
                <Icon name="arrow-forward" size={17} />
              </Pressable>
            </Sheet>
          </View>
        </Modal>
      </View>
    </View>
  );
}

function Icon({
  name,
  size = 20,
  color = C.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name === "arrow-up-right" ? "arrow-forward" : name}
      size={size}
      color={color}
      style={
        name === "arrow-up-right"
          ? { transform: [{ rotate: "-45deg" }] }
          : undefined
      }
    />
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View style={s.pageHeading}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.pageTitle}>
        {title.replace(/\.$/, "")}
        <Text style={{ color: C.lime }}>.</Text>
      </Text>
      <Text style={s.pageDescription}>{description}</Text>
    </View>
  );
}
function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={s.search}>
      <Icon name="search-outline" size={20} color={C.muted} />
      <TextInput
        style={s.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#90968c"
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {!!value && (
        <Pressable
          onPress={() => onChange("")}
          accessibilityLabel="Clear search"
        >
          <Icon name="close-circle" size={18} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      hitSlop={5}
      style={[
        s.chip,
        active && {
          backgroundColor: color || C.lime,
          borderColor: color || C.lime,
        },
      ]}
    >
      {color && !active && (
        <View style={[s.tinyDot, { backgroundColor: color }]} />
      )}
      <Text style={[s.chipText, active && { color: "#241c35" }]}>{label}</Text>
    </Pressable>
  );
}
function Avatar({
  person,
  size = 48,
}: {
  person: {
    initials: string;
    color: string;
    photoUrl?: string;
    name?: string;
    id?: string;
  };
  size?: number;
}) {
  return (
    <Portrait
      node={{
        id: person.id || person.initials,
        name: person.name || person.initials,
        color: person.color,
        photoUrl: person.photoUrl,
      }}
      size={size}
    />
  );
}
function Action({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.action, pressed && { opacity: 0.8 }]}
    >
      <Text style={s.actionText}>{label}</Text>
      <Icon name={icon} size={21} color="#241c35" />
    </Pressable>
  );
}
function SessionCard({
  talk,
  saved,
  onSave,
  onOpen,
  onExplain,
  featured = false,
  reason,
}: {
  talk: Talk;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onExplain: () => void;
  featured?: boolean;
  reason?: string;
}) {
  const speaker = speakerOf(talk);
  return (
    <View style={[s.sessionCard, featured && s.featuredSession]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open session ${talk.title}`}
        onPress={onOpen}
        style={s.sessionCardMain}
      >
        {featured && (
          <View style={[s.sessionArt, { backgroundColor: talk.color }]}>
            <View style={s.sessionArtTag}>
              <View style={s.tinyDot} />
              <Text style={s.sessionArtTagText}>
                A LITTLE AHEAD OF THE CURVE
              </Text>
            </View>
            <SessionArt size={135} variant={talk.topicIds[0] || "event"} />
            <Text style={s.artIndex}>01 / ∞</Text>
          </View>
        )}
        <View style={s.sessionBody}>
          <View style={s.sessionMeta}>
            <Text style={s.sessionTime}>
              {talk.time} – {talk.end}
            </Text>
            <View style={s.metaDot} />
            <Text style={s.sessionRoom} numberOfLines={1}>
              {roomOf(talk)}
            </Text>
            <View style={[s.formatPill, { backgroundColor: talk.color }]}>
              <Text style={s.formatText}>{talk.format}</Text>
            </View>
          </View>
          <Text style={s.sessionTitle}>{talk.title}</Text>
          {!!reason&&<Text style={{fontSize:12,lineHeight:20,color:'#b6d7c8',marginTop:8,marginBottom:10}}>{reason}</Text>}
          <Text style={s.sessionSubtitle} numberOfLines={2}>
            {talk.subtitle ||
              "Official program event. Open for schedule details."}
          </Text>
          <View style={s.sessionSpeaker}>
            {talk.speakerId ? (
              <Avatar person={speaker} size={31} />
            ) : (
              <Icon name="calendar-outline" size={22} color="#849578" />
            )}
            <Text style={s.sessionSpeakerText}>
              {speaker.name}
              {!!talk.speakerId && (
                <Text style={{ color: "#a49ab5" }}>
                  {talk.speakerIds.length > 1
                    ? ` + ${talk.speakerIds.length - 1} more`
                    : speaker.company
                      ? ` · ${speaker.company}`
                      : ""}
                </Text>
              )}
            </Text>
          </View>
        </View>
      </Pressable>
      <View style={s.sessionBottom}>
        {talk.topicIds.length ? (
          <Pressable onPress={onExplain} style={s.whyButton}>
            <Icon name="git-network-outline" size={15} />
            <Text style={s.whyText}>Why this connects</Text>
            <Icon name="arrow-up-right" size={13} />
          </Pressable>
        ) : (
          <Pressable onPress={onOpen} style={s.whyButton}>
            <Icon name="open-outline" size={15} />
            <Text style={s.whyText}>Official event details</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onSave}
          style={[s.saveButton, saved && s.saveButtonActive]}
          accessibilityLabel={
            saved ? `Remove ${talk.title} from plan` : `Save ${talk.title}`
          }
        >
          <Icon name={saved ? "bookmark" : "bookmark-outline"} size={18} />
          <Text style={s.saveText}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
function PersonRow({
  person,
  met,
  onOpen,
  onExplain,
}: {
  person: Person;
  met: boolean;
  onOpen: () => void;
  onExplain: () => void;
}) {
  return (
    <View style={s.personRow}>
      <Pressable onPress={onOpen} style={s.personRowMain}>
        <Avatar person={person} size={49} />
        <View style={{ flex: 1 }}>
          <Text style={s.personName}>
            {person.name}
            {met && <Text style={{ color: "#a49ab5" }}> ✓</Text>}
          </Text>
          <Text style={s.personRole}>
            {person.role} · {person.company}
          </Text>
          <Text style={s.personCity}>{person.city}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onExplain}
        style={s.personArrow}
        hitSlop={8}
        accessibilityLabel={`Explain your connection to ${person.name}`}
      >
        <Icon name="arrow-up-right" size={18} />
      </Pressable>
    </View>
  );
}
function PersonCard({
  person,
  interests,
  met,
  onOpen,
  onExplain,
}: {
  person: Person;
  interests: string[];
  met: boolean;
  onOpen: () => void;
  onExplain: () => void;
}) {
  const shared = person.topicIds.filter((id) => interests.includes(id));
  return (
    <View style={s.personCard}>
      <Pressable style={s.personCardHead} onPress={onOpen}>
        <Avatar person={person} size={62} />
        <View style={{ flex: 1 }}>
          <Text style={s.personCardName}>{person.name}</Text>
          <Text style={s.personRole}>{person.role}</Text>
          <Text style={s.personCompany}>
            {person.company} <Text style={{ color: "#c1c4b8" }}>·</Text>{" "}
            {person.city}
          </Text>
        </View>
        <Icon
          name={met ? "checkmark-circle" : "arrow-up-right"}
          size={22}
          color={met ? "#70914f" : C.ink}
        />
      </Pressable>
      <View style={s.personTopics}>
        {person.topicIds.map((id) => (
          <View
            key={id}
            style={[
              s.personTopic,
              { backgroundColor: `${topicOf(id).color}66` },
            ]}
          >
            <View style={[s.tinyDot, { backgroundColor: topicOf(id).color }]} />
            <Text style={s.personTopicText}>{topicOf(id).name}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={onExplain} style={s.personCardFoot}>
        <Icon name="git-network-outline" size={15} />
        <Text style={s.whyText}>
          {shared.length
            ? `${shared.length} shared demo interest${shared.length > 1 ? "s" : ""} · see the path`
            : "Explore a new demo connection"}
        </Text>
        <Icon name="arrow-forward" size={14} />
      </Pressable>
    </View>
  );
}
function GraphStatus({
  live,
  label,
  counts,
  onPress,
}: {
  live: boolean;
  label: string;
  counts: { nodes: number; edges: number };
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.graphStatus}>
      <View
        style={[s.tinyDot, { backgroundColor: live ? "#79a84c" : "#c6aa69" }]}
      />
      <Text style={s.graphStatusText}>
        {label}
        <Text style={{ color: "#b0b4a7" }}> · </Text>
        {counts.nodes} nodes · {counts.edges} connections
      </Text>
      <Icon name="information-circle-outline" size={15} color={C.muted} />
    </Pressable>
  );
}
function RecommendationNotice({
  label,
  live,
  pending,
  loading,
  connected,
  onRetry,
}: {
  label: string;
  live: boolean;
  pending: boolean;
  loading: boolean;
  connected: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={[s.interestStrip, { marginTop: 0, marginBottom: 14 }]}>
      {loading ? (
        <ActivityIndicator size="small" color="#7f956b" />
      ) : (
        <Icon
          name={live ? "checkmark-circle-outline" : "cloud-offline-outline"}
          size={20}
          color="#7f956b"
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.interestTitle}>{label}</Text>
        <Text style={[s.interestSub, { lineHeight: 15 }]}>
          {live
            ? "Picked for the interests you’ve saved."
            : pending
              ? "Your new interests will sync when you’re connected."
              : loading
                ? "A preview while we refresh your recommendations."
                : !connected
                  ? "Saved matches are a preview. Reconnect for current recommendations."
                  : "Explore the official program while recommendations refresh."}
        </Text>
      </View>
      {!live && connected && !pending && !loading && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry recommendations"
          onPress={onRetry}
          style={s.roundButton}
          hitSlop={8}
        >
          <Icon name="refresh-outline" size={18} />
        </Pressable>
      )}
    </View>
  );
}
function Empty({
  icon,
  title,
  message,
}: {
  icon: IconName;
  title: string;
  message: string;
}) {
  return (
    <View style={s.empty}>
      <Icon name={icon} size={33} color="#839372" />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyDescription}>{message}</Text>
    </View>
  );
}
function Sheet({
  visible,
  onClose,
  title,
  eyebrow,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  if (!visible) return null;
  return (
    <View
      style={[
        s.sheet,
        {
          width: Math.min(width, 520),
          maxHeight: "94%",
          paddingBottom: Math.max(inset.bottom, 22),
        },
      ]}
    >
      <View style={s.sheetHandle} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.sheetContent}
      >
        <View style={s.sheetTop}>
          <Text style={s.eyebrow}>{eyebrow}</Text>
          <Pressable
            onPress={onClose}
            style={s.sheetClose}
            hitSlop={8}
            accessibilityLabel="Close details"
          >
            <Icon name="close" size={21} />
          </Pressable>
        </View>
        {!!title && <Text style={s.sheetTitle}>{title}</Text>}
        {children}
      </ScrollView>
    </View>
  );
}
function ExactProofPath({ proof }: { proof: GraphProof }) {
  return (
    <View style={s.proofBox}>
      {proof.traversalNodeIds.map((nodeId, index) => {
        const node = proof.nodes.find((value) => value.id === nodeId);
        if (!node) return null;
        const previous = proof.traversalNodeIds[index - 1];
        const edge = index
          ? proof.edges.find(
              (value) =>
                (value.source === previous && value.target === nodeId) ||
                (value.target === previous && value.source === nodeId),
            )
          : undefined;
        const icon: IconName =
          node.kind === "Topic"
            ? "sparkles-outline"
            : node.kind === "Talk"
              ? "albums-outline"
              : node.kind === "Speaker"
                ? "mic-outline"
                : node.kind === "Room"
                  ? "location-outline"
                  : "person-outline";
        const color =
          node.kind === "Topic"
            ? topics.find((topic) => topic.id === node.id)?.color || C.lime
            : node.kind === "Speaker"
              ? C.lilac
              : node.kind === "Attendee"
                ? people.find((person) => `demo:${person.id}` === node.id)
                    ?.color || "#e6e9dd"
                : "#e9e9de";
        return (
          <React.Fragment key={`${nodeId}-${index}`}>
            {!!index &&
              (edge ? (
                <View
                  accessible
                  accessibilityLabel={`${proof.nodes.find((value) => value.id === edge.source)?.label || edge.source} ${edge.kind} ${proof.nodes.find((value) => value.id === edge.target)?.label || edge.target}`}
                >
                  <PathConnector
                    label={edge.kind}
                    reverse={edge.source === nodeId}
                  />
                </View>
              ) : (
                <Text style={[s.personRole, { marginVertical: 10 }]}>
                  No connecting edge was returned.
                </Text>
              ))}
            <PathNode
              icon={icon}
              label={node.label}
              sub={`${node.kind} · returned graph node`}
              color={color}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}
function PathNode({
  icon,
  label,
  sub,
  color,
}: {
  icon: IconName;
  label: string;
  sub: string;
  color: string;
}) {
  return (
    <View style={s.pathNode}>
      <View style={[s.pathNodeIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={23} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.pathNodeLabel}>{label}</Text>
        <Text style={s.pathNodeSub}>{sub}</Text>
      </View>
    </View>
  );
}
function PathConnector({
  label,
  reverse = false,
}: {
  label: string;
  reverse?: boolean;
}) {
  return (
    <View style={s.pathConnector}>
      <View style={s.pathConnectorLine} />
      <Text style={s.pathConnectorLabel}>{label}</Text>
      <View
        style={[
          s.pathConnectorArrow,
          reverse && { top: -1, bottom: undefined },
        ]}
      >
        <Icon
          name={reverse ? "chevron-up" : "chevron-down"}
          size={12}
          color="#a0a994"
        />
      </View>
    </View>
  );
}

function SessionArt({ size, variant }: { size: number; variant: string }) {
  const isGraph = variant === "graph";
  return (
    <Svg width={size} height={size} viewBox="0 0 180 180">
      <G transform="translate(90 90)">
        {[0, 30, 60, 90, 120, 150].map((angle, i) => (
          <Ellipse
            key={angle}
            cx={0}
            cy={0}
            rx={isGraph ? 58 : 64}
            ry={isGraph ? 28 : 25}
            stroke={i % 2 ? "#5c745a" : "#263c2b"}
            fill="none"
            strokeWidth={1.05}
            rotation={angle}
            opacity={0.8}
          />
        ))}
        <Circle
          r={30}
          fill={isGraph ? "#d4c4ef" : "#b6cf94"}
          stroke="#718365"
          strokeWidth={0.5}
        />
        <Circle cx={-11} cy={-10} r={12} fill="#f6f9ed" opacity={0.7} />
        <Circle cx={49} cy={-39} r={7} fill={C.ink} />
        <Circle
          cx={-58}
          cy={30}
          r={5}
          fill="#fbfcf3"
          stroke={C.ink}
          strokeWidth={0.7}
        />
        <Path
          d="M -70 -55 L -70 -43 M -76 -49 L -64 -49"
          stroke={C.ink}
          strokeWidth={1.3}
        />
        <Circle cx={65} cy={46} r={2} fill={C.ink} />
      </G>
    </Svg>
  );
}

function OrbitSphere({
  size,
  mini = false,
  peopleToShow,
  onSelect,
}: {
  size: number;
  mini?: boolean;
  peopleToShow: Person[];
  onSelect: (p: Person) => void;
}) {
  const center = size / 2;
  const r = size * 0.39;
  const placements = [
    { x: 0.32, y: 0.33 },
    { x: 0.62, y: 0.27 },
    { x: 0.73, y: 0.53 },
    { x: 0.56, y: 0.73 },
    { x: 0.27, y: 0.65 },
    { x: 0.46, y: 0.49 },
  ];
  return (
    <View style={{ width: size, height: size, alignSelf: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={`glow${mini}`} cx="40%" cy="35%" r="65%">
            <Stop offset="0" stopColor="#63825b" stopOpacity=".2" />
            <Stop offset="1" stopColor="#14291e" stopOpacity=".8" />
          </RadialGradient>
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={r * 1.21}
          stroke="#a6cb86"
          strokeOpacity=".08"
          fill="none"
          strokeDasharray="2 7"
        />
        <Circle
          cx={center}
          cy={center}
          r={r}
          fill={`url(#glow${mini})`}
          stroke="#a8c88b"
          strokeOpacity=".5"
          strokeWidth={0.8}
        />
        {[-0.66, -0.33, 0, 0.33, 0.66].map((lat, i) => (
          <Ellipse
            key={`lat${i}`}
            cx={center}
            cy={center + r * lat}
            rx={Math.sqrt(1 - lat * lat) * r}
            ry={Math.sqrt(1 - lat * lat) * r * 0.15}
            stroke="#a8c88b"
            strokeOpacity=".2"
            fill="none"
            strokeWidth={0.65}
          />
        ))}
        {[0.2, 0.5, 0.8].map((lon, i) => (
          <Ellipse
            key={`lon${i}`}
            cx={center}
            cy={center}
            rx={r * lon}
            ry={r}
            stroke="#a8c88b"
            strokeOpacity=".28"
            fill="none"
            strokeWidth={0.65}
          />
        ))}
        <Line
          x1={center - r}
          y1={center}
          x2={center + r}
          y2={center}
          stroke="#a8c88b"
          strokeOpacity=".3"
          strokeWidth={0.7}
        />
        <Path
          d={`M${size * 0.23} ${size * 0.32} C${size * 0.18} ${size * 0.46} ${size * 0.35} ${size * 0.42} ${size * 0.35} ${size * 0.54} S${size * 0.42} ${size * 0.74} ${size * 0.47} ${size * 0.76} L${size * 0.51} ${size * 0.61} L${size * 0.45} ${size * 0.53} L${size * 0.48} ${size * 0.45} L${size * 0.38} ${size * 0.4} L${size * 0.41} ${size * 0.3} Z`}
          fill="#729b5d"
          fillOpacity=".14"
          stroke="#9fc17e"
          strokeOpacity=".3"
          strokeWidth={0.6}
        />
        <Path
          d={`M${size * 0.52} ${size * 0.28} L${size * 0.67} ${size * 0.25} L${size * 0.76} ${size * 0.36} L${size * 0.7} ${size * 0.46} L${size * 0.61} ${size * 0.45} L${size * 0.58} ${size * 0.56} L${size * 0.65} ${size * 0.69} L${size * 0.57} ${size * 0.7} L${size * 0.49} ${size * 0.52} L${size * 0.53} ${size * 0.42} Z`}
          fill="#729b5d"
          fillOpacity=".14"
          stroke="#9fc17e"
          strokeOpacity=".3"
          strokeWidth={0.6}
        />
        {peopleToShow.slice(0, mini ? 3 : 6).map((p) => {
          const index = people.findIndex((pp) => pp.id === p.id);
          const pos = placements[index];
          return (
            <G key={p.id}>
              <Path
                d={`M ${size * 0.46} ${size * 0.49} Q ${size * 0.5} ${size * 0.18} ${size * pos.x} ${size * pos.y}`}
                stroke={index % 2 ? "#d8c4f0" : C.lime}
                strokeWidth={mini ? 1 : 1.2}
                strokeOpacity=".6"
                fill="none"
                strokeDasharray="3 3"
              />
              <Circle
                cx={size * pos.x}
                cy={size * pos.y}
                r={mini ? 4 : 6}
                fill={C.lime}
                stroke="#173020"
                strokeWidth={2}
              />
            </G>
          );
        })}
        <Circle cx={size * 0.46} cy={size * 0.49} r={5} fill={C.lime} />
        <Circle
          cx={size * 0.46}
          cy={size * 0.49}
          r={10}
          stroke={C.lime}
          strokeOpacity=".3"
          fill="none"
        />
      </Svg>
      {!mini &&
        peopleToShow.map((p) => {
          const i = people.findIndex((pp) => pp.id === p.id);
          const pos = placements[i];
          return (
            <Pressable
              key={p.id}
              accessibilityLabel={`Explore ${p.name} from ${p.city}`}
              onPress={() => onSelect(p)}
              style={[
                s.globePerson,
                { left: size * pos.x - 20, top: size * pos.y - 42 },
              ]}
            >
              <View style={[s.globeAvatar, { backgroundColor: p.color }]}>
                <Text style={s.globeInitial}>{p.initials}</Text>
              </View>
              <Text style={s.globePersonName}>{p.name.split(" ")[0]}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

const s = StyleSheet.create({
  discoverTabs: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    backgroundColor: "#1b1d2a",
    borderRadius: 24,
    marginBottom: 22,
    alignSelf: "flex-start",
  },
  discoverTab: {
    paddingHorizontal: 19,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  discoverTabActive: { backgroundColor: "#393247" },
  discoverTabText: { color: "#e0d7ef", fontSize: 12 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: "#302a3d",
  },
  menuText: { color: "#d9d1e8", fontSize: 14, flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
  stage: { flex: 1, alignItems: "center", backgroundColor: "#0b0d15" },
  app: { flex: 1, backgroundColor: C.bg, overflow: "hidden" },
  topbar: {
    paddingHorizontal: 23,
    height: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#30263e",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 20, fontWeight: "700", color: C.ink, letterSpacing: -0.9 },
  avatarSmall: {
    height: 36,
    width: 36,
    borderRadius: 14,
    backgroundColor: "#242535",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#363448",
  },
  avatarSmallText: { fontSize: 9, fontWeight: "700", color: C.ink },
  avatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9cd56f",
    borderWidth: 2,
    borderColor: C.bg,
    position: "absolute",
    bottom: -1,
    right: -1,
  },
  content: { paddingHorizontal: 23, paddingTop: 17 },
  eventPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 26,
  },
  tinyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.ink },
  eventPillText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#a49ab5",
  },
  eventPillSeparator: { fontSize: 10, color: "#b1b6a7" },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 8.6,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: "#a49ab5",
  },
  pageTitle: {
    fontSize: 37,
    lineHeight: 41,
    letterSpacing: -1.9,
    fontWeight: "500",
    color: C.ink,
    marginTop: 10,
  },
  spark: {
    height: 47,
    width: 47,
    borderRadius: 18,
    backgroundColor: "#242535",
    transform: [{ rotate: "-12deg" }],
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
  },
  intro: { fontSize: 13, lineHeight: 20, color: C.muted, marginTop: 14 },
  dateStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    marginTop: 5,
    gap: 11,
  },
  dateIcon: {
    width: 34,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#363448",
    alignItems: "center",
    justifyContent: "center",
  },
  dateTitle: { fontSize: 12, fontWeight: "600", color: C.ink, marginBottom: 3 },
  dateSub: { fontSize: 10, color: "#a49ab5" },
  countdown: {
    alignItems: "center",
    paddingLeft: 17,
    borderLeftWidth: 1,
    borderColor: C.line,
  },
  countdownNumber: {
    fontSize: 23,
    lineHeight: 24,
    letterSpacing: -1,
    fontWeight: "500",
    color: C.ink,
  },
  countdownLabel: {
    fontSize: 6.3,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#a49ab5",
    marginTop: 3,
  },
  orbitHero: {
    height: 298,
    backgroundColor: C.ink,
    borderRadius: 26,
    overflow: "hidden",
    padding: 23,
    marginTop: 4,
  },
  heroOrbit: {
    position: "absolute",
    right: -44,
    top: 24,
    opacity: 0.95,
    transform: [{ rotate: "-14deg" }],
  },
  heroLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroLabelText: {
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: "#a7be95",
    fontWeight: "600",
  },
  heroTitle: {
    fontSize: 33,
    lineHeight: 36,
    fontWeight: "500",
    letterSpacing: -1.5,
    color: "#f0f3e8",
    marginTop: 20,
  },
  heroDescription: {
    color: "#acbaa2",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 10,
  },
  heroCTA: {
    flexDirection: "row",
    gap: 18,
    backgroundColor: C.lime,
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 13,
    alignSelf: "flex-start",
    alignItems: "center",
    marginTop: 19,
  },
  heroCTAText: { fontSize: 11, fontWeight: "600", color: C.ink },
  heroFoot: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    alignItems: "center",
  },
  faceStack: { flexDirection: "row", alignItems: "center" },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#1e3327",
    alignItems: "center",
    justifyContent: "center",
  },
  miniInitial: { color: C.ink, fontSize: 7, fontWeight: "600" },
  heroFootText: { fontSize: 8, color: "#a49ab5" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 29,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 19,
    letterSpacing: -0.7,
    fontWeight: "500",
    color: C.ink,
  },
  textLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
  },
  textLinkText: { fontSize: 9.5, fontWeight: "500", color: "#a49ab5" },
  sessionCard: {
    borderRadius: 28,
    backgroundColor: "#202130f5",
    borderWidth: 1,
    borderColor: "#363448",
    marginBottom: 13,
    overflow: "hidden",
  },
  featuredSession: { borderColor: "#363448" },
  sessionCardMain: { overflow: "hidden" },
  sessionArt: {
    height: 148,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sessionArtTag: {
    position: "absolute",
    top: 15,
    left: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sessionArtTagText: {
    fontSize: 6.8,
    fontWeight: "500",
    letterSpacing: 1.3,
    color: "#a49ab5",
  },
  artIndex: {
    position: "absolute",
    right: 17,
    bottom: 15,
    fontSize: 8,
    letterSpacing: 1,
    color: "#a49ab5",
  },
  sessionBody: { padding: 17, paddingBottom: 15 },
  sessionMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  sessionTime: { fontSize: 9, fontWeight: "500", color: "#a49ab5" },
  metaDot: { width: 2, height: 2, borderRadius: 2, backgroundColor: "#8c9880" },
  sessionRoom: { fontSize: 9, color: "#a49ab5", flex: 1 },
  formatPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  formatText: { fontSize: 7.5, color: "#302b3d", fontWeight: "600" },
  sessionTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: C.ink,
    letterSpacing: -0.65,
    lineHeight: 25,
    marginTop: 10,
  },
  sessionSubtitle: {
    fontSize: 10.5,
    color: "#a49ab5",
    lineHeight: 16,
    marginTop: 5,
  },
  sessionSpeaker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 15,
  },
  sessionSpeakerText: { fontSize: 9.5, color: "#a49ab5", flex: 1 },
  sessionBottom: {
    marginHorizontal: 17,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#363448",
  },
  whyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
  },
  whyText: { color: "#a49ab5", fontSize: 8.5 },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#242535",
  },
  saveButtonActive: { backgroundColor: "#514061" },
  saveText: { fontSize: 9, color: C.ink, fontWeight: "500" },
  interestStrip: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#363448",
    borderRadius: 17,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  interestIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#242535",
    alignItems: "center",
    justifyContent: "center",
  },
  interestTitle: { fontSize: 11.5, fontWeight: "500", color: C.ink },
  interestSub: { fontSize: 8.5, color: "#a49ab5", marginTop: 4 },
  roundButton: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#242535",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarArc: { position: "absolute", backgroundColor: "#14251d10" },
  avatarShine: { position: "absolute", backgroundColor: "#ffffff30" },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  personRowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  personName: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.1,
  },
  personRole: { fontSize: 9, color: "#a49ab5", marginTop: 4, lineHeight: 14 },
  personCity: { fontSize: 8, color: "#a49ab5", marginTop: 3 },
  personArrow: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#242535",
  },
  graphStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 25,
  },
  graphStatusText: { fontSize: 8, color: "#a49ab5" },
  pageHeading: { marginTop: 7, marginBottom: 22 },
  pageDescription: {
    fontSize: 12,
    lineHeight: 19,
    color: C.muted,
    marginTop: 13,
    maxWidth: 290,
  },
  search: {
    height: 47,
    borderRadius: 15,
    backgroundColor: "#242535",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    height: 44,
    color: C.ink,
    outlineStyle: "none",
  } as any,
  dayTabs: { flexDirection: "row", gap: 9, marginTop: 22, marginBottom: 17 },
  dayTab: {
    padding: 14,
    flex: 1,
    borderRadius: 15,
    backgroundColor: "#242535",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayTabActive: { backgroundColor: C.ink },
  dayTabText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#a49ab5",
    letterSpacing: 1,
  },
  dayTabDate: { fontSize: 9, color: "#a49ab5" },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingBottom: 8,
    paddingTop: 3,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#363448",
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 20,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 9, fontWeight: "500", color: "#a49ab5" },
  resultsHead: {
    marginTop: 18,
    marginBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultsHint: { fontSize: 8, color: "#a49ab5" },
  demoNote: {
    fontSize: 9,
    color: "#a49ab5",
    textAlign: "center",
    lineHeight: 15,
    paddingHorizontal: 20,
    paddingVertical: 19,
  },
  peopleSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  peopleSummaryText: { fontSize: 9, color: "#a49ab5" },
  personCard: {
    backgroundColor: "#242535",
    borderWidth: 1,
    borderColor: "#363448",
    borderRadius: 22,
    marginBottom: 13,
    padding: 17,
    paddingBottom: 0,
  },
  personCardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  personCardName: {
    fontSize: 16,
    color: C.ink,
    fontWeight: "500",
    letterSpacing: -0.3,
  },
  personCompany: { fontSize: 9, color: "#a49ab5", marginTop: 3 },
  personTopics: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 17,
    marginBottom: 15,
  },
  personTopic: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  personTopicText: { fontSize: 8.2, color: "#a49ab5" },
  personCardFoot: {
    borderTopWidth: 1,
    borderColor: "#363448",
    paddingVertical: 13,
    gap: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  planStats: {
    backgroundColor: C.lime,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    padding: 23,
    gap: 23,
    marginTop: 4,
    marginBottom: 17,
  },
  planStat: { gap: 4 },
  planNumber: {
    fontSize: 34,
    fontWeight: "500",
    letterSpacing: -1.5,
    color: C.ink,
  },
  planStatLabel: { fontSize: 9, color: "#a49ab5" },
  planStatDivider: { height: 42, width: 1, backgroundColor: "#a9db6d" },
  planStatSpark: { marginLeft: "auto", alignSelf: "flex-start" },
  timelineDate: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 19,
    marginBottom: 13,
  },
  timelineDateText: {
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: "600",
    color: "#a49ab5",
  },
  emptyPlan: { alignItems: "center", paddingTop: 28, paddingBottom: 24 },
  emptyPlanArt: {
    height: 100,
    width: 100,
    borderRadius: 36,
    backgroundColor: "#242535",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    transform: [{ rotate: "-7deg" }],
  },
  smallSpark: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: C.lime,
    position: "absolute",
    right: -7,
    top: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: C.ink,
    letterSpacing: -0.7,
    marginTop: 15,
  },
  emptyDescription: {
    fontSize: 11,
    color: "#a49ab5",
    lineHeight: 18,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 21,
  },
  planTip: {
    borderTopWidth: 1,
    borderColor: C.line,
    marginTop: 25,
    paddingTop: 22,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  planTipText: { fontSize: 9, lineHeight: 15, color: "#a49ab5" },
  globeCard: {
    backgroundColor: C.ink,
    borderRadius: 27,
    overflow: "hidden",
    paddingVertical: 18,
    marginTop: 3,
    marginBottom: 20,
  },
  globeTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 4,
  },
  liveLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  globeLabel: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: "#a6bf95",
  },
  globeCount: { fontSize: 8, color: "#a49ab5" },
  globeHint: {
    textAlign: "center",
    color: "#a6bd95",
    fontSize: 9,
    marginBottom: 17,
    marginTop: -2,
  },
  globeLegend: {
    borderTopWidth: 1,
    borderColor: "#304332",
    marginHorizontal: 20,
    paddingTop: 15,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  globeLegendText: { fontSize: 8, color: "#a49ab5" },
  globePerson: { position: "absolute", width: 44, alignItems: "center" },
  globeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#1f3827",
    alignItems: "center",
    justifyContent: "center",
  },
  globeInitial: { fontSize: 8, color: C.ink, fontWeight: "600" },
  globePersonName: {
    fontSize: 7,
    backgroundColor: "#14251ddd",
    color: "#d4e8be",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  pathPreview: {
    borderWidth: 1,
    borderColor: "#363448",
    backgroundColor: "#242535",
    borderRadius: 21,
    padding: 16,
  },
  pathPreviewTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  pathPreviewIcon: {
    backgroundColor: "#242535",
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pathPreviewTitle: {
    fontSize: 12,
    lineHeight: 17,
    color: C.ink,
    fontWeight: "500",
    flex: 1,
  },
  pathPreviewDescription: {
    fontSize: 10,
    color: "#a49ab5",
    lineHeight: 17,
    marginTop: 12,
  },
  microPath: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 19,
    gap: 8,
  },
  microPathYou: {
    color: C.ink,
    fontWeight: "600",
    fontSize: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.lime,
    overflow: "hidden",
  },
  microPathLine: { flex: 1, height: 1, backgroundColor: "#b7c7a7" },
  microPathTopic: {
    fontSize: 8,
    color: "#a49ab5",
    padding: 9,
    borderRadius: 9,
    backgroundColor: "#242535",
    overflow: "hidden",
  },
  microPathPerson: {
    height: 30,
    width: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  navFade: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bottomNav: {
    position: "absolute",
    left: 18,
    right: 18,
    height: 67,
    borderRadius: 23,
    backgroundColor: "#242535",
    borderWidth: 1,
    borderColor: "#363448",
    padding: 6,
    flexDirection: "row",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    gap: 4,
  },
  navItemActive: { backgroundColor: "#393047" },
  navText: { fontSize: 8, color: "#a49ab5", fontWeight: "500" },
  navTextActive: { color: C.ink, fontWeight: "600" },
  navBadge: {
    position: "absolute",
    top: 2,
    right: 8,
    backgroundColor: C.ink,
    width: 13,
    height: 13,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  navBadgeText: { fontSize: 7, color: C.lime },
  toast: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "#393047",
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    maxWidth: "91%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
  },
  toastText: { fontSize: 11, color: "#e8f1dc", flexShrink: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#10211770",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 35,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#cbd2bf",
    marginTop: 10,
    marginBottom: 5,
  },
  sheetContent: { paddingHorizontal: 24, paddingBottom: 5 },
  sheetTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
    marginBottom: 9,
  },
  sheetClose: {
    height: 30,
    width: 30,
    backgroundColor: "#242535",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sheetTitle: {
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: -1.4,
    color: C.ink,
    fontWeight: "500",
    marginBottom: 12,
    maxWidth: 350,
  },
  sheetDescription: {
    fontSize: 12,
    color: "#a49ab5",
    lineHeight: 20,
    marginBottom: 22,
  },
  interestGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  interestOption: {
    width: "48%",
    padding: 17,
    height: 117,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#363448",
    backgroundColor: "#242535",
    justifyContent: "space-between",
  },
  interestOptionText: {
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
    maxWidth: 120,
  },
  interestCheck: {
    position: "absolute",
    right: 13,
    top: 14,
    height: 17,
    width: 17,
    borderWidth: 1,
    borderColor: "#363448",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  interestCount: {
    fontSize: 9,
    color: "#a49ab5",
    marginTop: 16,
    marginBottom: 18,
    textAlign: "center",
  },
  action: {
    height: 49,
    borderRadius: 15,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.lime,
    width: "100%",
  },
  actionText: { fontSize: 12, color: "#241c35", fontWeight: "600" },
  sheetFootnote: {
    fontSize: 9,
    textAlign: "center",
    lineHeight: 15,
    color: "#a49ab5",
    marginTop: 16,
    marginBottom: 8,
  },
  sessionDetailArt: {
    height: 168,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    marginBottom: 19,
  },
  detailTrack: {
    position: "absolute",
    bottom: 13,
    left: 15,
    backgroundColor: "#ffffff77",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  detailTrackText: { fontSize: 8, color: C.ink },
  detailMeta: {
    flexDirection: "row",
    gap: 19,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
    paddingVertical: 16,
    marginBottom: 16,
  },
  detailMetaItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  detailMetaText: { fontSize: 10, color: "#a49ab5" },
  speakerDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 23,
  },
  speakerTag: { fontSize: 7, color: "#a49ab5", letterSpacing: 1 },
  sheetSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  sheetSecondaryText: { fontSize: 10, color: "#a49ab5", flexShrink: 1 },
  profileHeader: { alignItems: "center", marginTop: 7, marginBottom: 25 },
  profileAvatarWrap: { marginBottom: 17 },
  profileSpark: {
    position: "absolute",
    right: -9,
    bottom: 2,
    width: 33,
    height: 33,
    borderRadius: 14,
    backgroundColor: C.lime,
    borderWidth: 3,
    borderColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 28,
    color: C.ink,
    fontWeight: "500",
    letterSpacing: -1.1,
  },
  profileRole: { fontSize: 11, color: "#a49ab5", marginTop: 7 },
  profileLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
  },
  profileLocationText: { fontSize: 9, color: "#a49ab5" },
  profileDemoPill: {
    backgroundColor: "#242535",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    marginLeft: 5,
  },
  profileDemoText: { fontSize: 6, letterSpacing: 0.7, color: "#a49ab5" },
  profileBio: {
    backgroundColor: "#242535",
    padding: 18,
    borderRadius: 19,
    marginBottom: 15,
  },
  profileBioLabel: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 1.3,
    color: "#a49ab5",
    marginBottom: 9,
  },
  profileBioText: { fontSize: 11, color: "#a49ab5", lineHeight: 19 },
  profileTopics: { flexDirection: "row", gap: 7, marginBottom: 25 },
  proofBox: {
    borderWidth: 1,
    borderColor: "#363448",
    borderRadius: 22,
    backgroundColor: "#242535",
    padding: 18,
    marginBottom: 17,
  },
  pathNode: { flexDirection: "row", alignItems: "center", gap: 13 },
  pathNodeIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  pathNodeLabel: {
    fontSize: 13,
    color: C.ink,
    fontWeight: "500",
    lineHeight: 18,
  },
  pathNodeSub: { fontSize: 8, color: "#a49ab5", marginTop: 3 },
  pathConnector: { height: 43, marginLeft: 22, justifyContent: "center" },
  pathConnectorLine: {
    width: 1,
    backgroundColor: "#bdccab",
    position: "absolute",
    top: 3,
    bottom: 3,
  },
  pathConnectorLabel: {
    fontSize: 6.5,
    color: "#a49ab5",
    marginLeft: 18,
    letterSpacing: 1.2,
  },
  pathConnectorArrow: { position: "absolute", bottom: -1, left: -5.5 },
  proofSource: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    marginBottom: 22,
  },
  proofSourceText: { fontSize: 8, color: "#a49ab5" },
  aboutStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#242535",
    borderRadius: 22,
    padding: 23,
    marginBottom: 22,
  },
  aboutNumber: {
    fontSize: 31,
    color: C.ink,
    fontWeight: "500",
    letterSpacing: -1,
  },
  aboutInfo: { flexDirection: "row", gap: 11, marginBottom: 22 },
  aboutDescription: {
    fontSize: 10,
    lineHeight: 17,
    color: "#a49ab5",
    marginTop: 6,
  },
  aboutBody: {
    fontSize: 11,
    lineHeight: 19,
    color: "#a49ab5",
    marginBottom: 22,
  },
  empty: { alignItems: "center", paddingTop: 35, paddingBottom: 20 },
});
