import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useAction,
  useMutation,
  useQuery,
  useConvexAuth,
  useConvexConnectionState,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Expand,
  Globe2,
  House,
  MapPin,
  Network,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
  CheckCheck,
  Command,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  talks,
  speakers,
  topics,
  rooms,
  people,
  pathCypher,
  speakerFor,
  programSource,
  type Talk,
  type Person,
} from "../../../packages/core/data";
import { demoGraph } from "../../../packages/core/demoGraph";
import type {
  RecommendationState,
  GraphProof,
} from "../../../packages/core/intelligence";
import type { GraphNode, GraphLink } from "./GraphScene";
import PresentationPanel, {
  publicKinds,
  ProofTrail,
  useBrowserOnline,
  usePresentation,
  type PresentationBridge,
} from "./PresentationPanel";
const GraphScene = lazy(() => import("./GraphScene"));
type View = "today" | "sessions" | "people" | "plan" | "graph";
type Preferences = { bookmarks: string[]; topicIds: string[]; met: string[] };
type Recommendation = {
  talkId: string;
  topicId: string;
  speakerId: string;
  path: string[];
  proof?: GraphProof;
};
type LiveData = {
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  counts: { nodes: number; edges: number };
};
const publicPathCypher =
  "MATCH p=(topic:Topic)<-[about:ABOUT]-(talk:Talk)<-[presents:PRESENTS]-(speaker:Speaker) WHERE topic.id IN $topicIds AND topic.eventId=$eventId AND talk.eventId=$eventId AND speaker.eventId=$eventId AND about.eventId=$eventId AND presents.eventId=$eventId RETURN p";
const defaultPrefs: Preferences = {
  bookmarks: [],
  topicIds: ["ai", "security"],
  met: [],
};
const nav = [
  { id: "today", label: "Today", icon: House },
  { id: "sessions", label: "Sessions", icon: CalendarDays },
  { id: "people", label: "People", icon: Users },
  { id: "plan", label: "My plan", icon: Bookmark },
  { id: "graph", label: "The constellation", icon: Globe2 },
] as const;
function localPreferences() {
  try {
    return {
      ...defaultPrefs,
      ...JSON.parse(localStorage.getItem("conferenceos:v1") || "{}"),
    };
  } catch {
    return defaultPrefs;
  }
}
function ConnectedApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const browserOnline = useBrowserOnline();
  const connection = useConvexConnectionState();
  const online = browserOnline && connection.isWebSocketConnected;
  const { signIn } = useAuthActions();
  const prefs = useQuery(api.preferences.mine, {});
  const bookmark = useMutation(api.preferences.toggleBookmark),
    interests = useMutation(api.preferences.setInterests),
    met = useMutation(api.preferences.markMet);
  const bootstrap = useAction(api.graph.bootstrap),
    ensure = useMutation(api.intelligence.ensure),
    retry = useMutation(api.intelligence.retry);
  const intelligence = useQuery(
    api.intelligence.mine,
    isAuthenticated ? {} : "skip",
  ) as RecommendationState | undefined;
  const presentation = usePresentation(isAuthenticated);
  const [data, setData] = useState<LiveData | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Connecting to graph");
  const authState = useRef(isAuthenticated);
  authState.current = isAuthenticated;
  const signInAttempt = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !signInAttempt.current) {
      signInAttempt.current = signIn("anonymous").catch(() => {
        setError("Your private space could not connect. Refresh to try again.");
      });
    }
  }, [isLoading, isAuthenticated, signIn]);
  useEffect(() => {
    let active = true;
    bootstrap({})
      .then((d) => {
        if (active) {
          setData(d);
          setStatus("FalkorDB · public graph snapshot");
        }
      })
      .catch(() => {
        if (active) setStatus("Public program preview · graph unavailable");
      });
    return () => {
      active = false;
    };
  }, [bootstrap]);
  useEffect(() => {
    if (isAuthenticated)
      void ensure({}).catch(() =>
        setError("Could not start recommendations. Please retry."),
      );
  }, [isAuthenticated, ensure]);
  async function auth() {
    if (!authState.current) {
      await (signInAttempt.current ?? signIn("anonymous"));
      for (let i = 0; i < 40 && !authState.current; i++)
        await new Promise((resolve) => setTimeout(resolve, 100));
      if (!authState.current)
        throw new Error(
          "Your private space is still connecting. Try again in a moment.",
        );
    }
  }
  async function change(
    kind: "bookmark" | "interest" | "met",
    value: string | string[],
  ) {
    try {
      await auth();
      if (kind === "bookmark") await bookmark({ talkId: value as string });
      else if (kind === "met") await met({ personId: value as string });
      else await interests({ topicIds: value as string[] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      throw e;
    }
  }
  return (
    <Shell
      prefs={prefs ?? defaultPrefs}
      data={data}
      recommendations={
        intelligence?.status === "ready" ? intelligence.talks : []
      }
      intelligence={intelligence}
      onRetry={async () => {
        await retry({});
      }}
      presentation={presentation}
      online={online}
      status={online ? status : "Offline · public graph snapshot"}
      error={error}
      clearError={() => setError("")}
      onChange={change}
      privateReady={isAuthenticated}
    />
  );
}
function OfflineApp() {
  const [prefs, setPrefs] = useState<Preferences>(localPreferences);
  return (
    <Shell
      prefs={prefs}
      data={null}
      recommendations={[]}
      status="Local demo · saved on this device"
      privateReady={false}
      error=""
      clearError={() => {}}
      onChange={async (kind, value) => {
        setPrefs((p) => {
          const next = { ...p };
          if (kind === "interest") next.topicIds = value as string[];
          else {
            const key = kind === "met" ? "met" : "bookmarks",
              id = value as string;
            next[key] = p[key].includes(id)
              ? p[key].filter((x) => x !== id)
              : [...p[key], id];
          }
          localStorage.setItem("conferenceos:v1", JSON.stringify(next));
          return next;
        });
      }}
    />
  );
}
export default function App({ connected }: { connected: boolean }) {
  return connected ? <ConnectedApp /> : <OfflineApp />;
}
function Avatar({
  person,
  size = "normal",
}: {
  person: { initials: string; color: string; name: string; photoUrl?: string };
  size?: "small" | "normal" | "large";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: person.color }}
      aria-label={person.name}
    >
      {person.photoUrl ? (
        <img
          src={person.photoUrl}
          alt={person.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span>{person.initials}</span>
    </span>
  );
}
function OrbMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`orb-mark ${small ? "small" : ""}`}>
      <span />
      <span />
      <span />
    </span>
  );
}
function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
function Shell({
  prefs,
  data,
  recommendations,
  intelligence,
  onRetry,
  presentation,
  online = false,
  status,
  error,
  clearError,
  onChange,
  privateReady,
}: {
  prefs: Preferences;
  data: LiveData | null;
  recommendations: Recommendation[];
  intelligence?: RecommendationState;
  onRetry?: () => Promise<void>;
  presentation?: PresentationBridge;
  online?: boolean;
  status: string;
  error: string;
  clearError: () => void;
  onChange: (
    kind: "bookmark" | "interest" | "met",
    value: string | string[],
  ) => Promise<void>;
  privateReady: boolean;
}) {
  const [view, setView] = useState<View>("today"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [day, setDay] = useState(1),
    [detail, setDetail] = useState<Talk | null>(null),
    [person, setPerson] = useState<Person | null>(null),
    [settings, setSettings] = useState(false),
    [explain, setExplain] = useState<Recommendation | null>(null),
    [toast, setToast] = useState(""),
    [stage, setStage] = useState(false),
    [selected, setSelected] = useState<GraphNode | null>(null),
    [playing, setPlaying] = useState(
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [pending, setPending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeProof, setActiveProof] = useState<GraphProof | null>(null),
    [animationComplete, setAnimationComplete] = useState(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const notify = (s: string) => {
    setToast(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  };
  async function change(
    kind: "bookmark" | "interest" | "met",
    value: string | string[],
  ) {
    const id = Array.isArray(value) ? "interests" : value;
    setPending(id);
    try {
      await onChange(kind, value);
      notify(
        kind === "interest"
          ? "Your interests are updated"
          : kind === "met"
            ? prefs.met.includes(id)
              ? "Connection removed"
              : "Connection remembered"
            : prefs.bookmarks.includes(id)
              ? "Removed from your plan"
              : "Added to your plan",
      );
    } catch {
    } finally {
      setPending(null);
    }
  }
  function go(v: View) {
    setView(v);
    setSearch("");
    setSelected(null);
    setActiveProof(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggleStage() {
    setStage((value) => !value);
    setSelected(null);
    setActiveProof(null);
    setDetail(null);
    setPerson(null);
    setSettings(false);
    setExplain(null);
    setToast("");
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetail(null);
        setPerson(null);
        setSettings(false);
        setExplain(null);
        setStage(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const sourceGraph = data?.graph ?? demoGraph;
  const publicNodes = sourceGraph.nodes.filter((node) =>
      publicKinds.has(node.kind),
    ),
    publicIds = new Set(publicNodes.map((node) => node.id));
  const graph = {
    nodes: publicNodes,
    links: sourceGraph.links.filter(
      (edge) => publicIds.has(edge.source) && publicIds.has(edge.target),
    ),
  };
  const suggested = talks.filter((t) =>
    intelligence
      ? intelligence.status === "ready" &&
        recommendations.some((r) => r.talkId === t.id)
      : t.topicIds.some((id) => prefs.topicIds.includes(id)),
  );
  const filtered = talks.filter(
    (t) =>
      t.day === day &&
      (filter === "all" || t.topicIds.includes(filter)) &&
      `${t.title} ${t.track} ${speakerFor(t).name} ${t.subtitle}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const displayPeople = people.filter((p) =>
    `${p.name} ${p.role} ${p.company}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const hasPresentation = Boolean(
    presentation?.sessionId &&
    !["revoked", "expired", "unavailable"].includes(presentation.status),
  );
  const currentProof = !online
    ? null
    : stage || hasPresentation
      ? (presentation?.proof ?? null)
      : activeProof;
  const proofKey =
    stage || hasPresentation
      ? `presentation:${presentation?.sessionId}:${presentation?.revision}:${presentation?.status}`
      : `private:${intelligence?.revision}:${activeProof?.traversalNodeIds.join(":")}`;
  const highlighted = stage || !online ? [] : selected ? [selected.id] : [];
  useEffect(() => setAnimationComplete(false), [proofKey, currentProof]);
  useEffect(() => {
    setActiveProof(null);
    setExplain(null);
  }, [intelligence?.revision, intelligence?.status]);
  useEffect(() => {
    if (presentation?.sessionId) {
      setActiveProof(null);
      setExplain(null);
      setSelected(null);
    }
  }, [presentation?.sessionId, presentation?.status]);
  function reason(t: Talk) {
    const live = recommendations.find((r) => r.talkId === t.id);
    const topic =
      topics.find(
        (x) => t.topicIds.includes(x.id) && prefs.topicIds.includes(x.id),
      ) ??
      topics.find((x) => t.topicIds.includes(x.id)) ??
      topics[0];
    return (
      live ?? {
        talkId: t.id,
        topicId: topic.id,
        speakerId: t.speakerId,
        path: [
          prefs.topicIds.includes(topic.id)
            ? "Your interest"
            : "Explore a topic",
          topic.name,
          t.title,
          speakerFor(t).name,
        ],
      }
    );
  }
  function talkCard(t: Talk, compact = false) {
    const s = speakerFor(t);
    return (
      <article
        className={`session-card ${compact ? "compact" : ""}`}
        key={t.id}
        style={{ "--card-color": t.color } as React.CSSProperties}
      >
        <button
          className={`save-button ${prefs.bookmarks.includes(t.id) ? "saved" : ""}`}
          aria-label={`${prefs.bookmarks.includes(t.id) ? "Remove" : "Save"} ${t.title}`}
          disabled={pending === t.id}
          onClick={() => change("bookmark", t.id)}
        >
          <Bookmark
            size={19}
            fill={prefs.bookmarks.includes(t.id) ? "currentColor" : "none"}
          />
        </button>
        <button className="session-main" onClick={() => setDetail(t)}>
          <span className="session-tags">
            <span className="tiny-dot" />
            {t.track}
            <span className="format">{t.format}</span>
          </span>
          <h3>{t.title}</h3>
          <p>{t.subtitle}</p>
          <span className="speaker-line">
            <Avatar person={s} size="small" />
            <span>
              <strong>{s.name}</strong>
              <small>{s.company}</small>
            </span>
          </span>
          <span className="session-meta">
            <span>
              <Clock size={13} />
              {t.time} – {t.end}
            </span>
            <span>
              <MapPin size={13} />
              {rooms.find((r) => r.id === t.roomId)?.name}
            </span>
          </span>
        </button>
        <button
          className="path-link"
          onClick={() =>
            t.topicIds.length && t.speakerId
              ? setExplain(reason(t))
              : setDetail(t)
          }
        >
          <Network size={13} />
          {!t.topicIds.length || !t.speakerId
            ? "See official event details"
            : prefs.topicIds.some((id) => t.topicIds.includes(id))
              ? "Connected to your interests"
              : "Explore the connection"}
          <ArrowUpRight size={13} />
        </button>
      </article>
    );
  }
  return (
    <div
      className={`app ${stage ? "stage" : ""}`}
      data-stage={stage ? "true" : "false"}
      data-intelligence-status={intelligence?.status ?? "preview"}
      data-intelligence-revision={intelligence?.revision ?? ""}
    >
      {!stage && (
        <aside className="sidebar">
          <button className="brand" onClick={() => go("today")}>
            <OrbMark />
            <span>
              conference<span className="brand-os">OS</span>
              <small>MAKE YOUR NEXT CONNECTION COUNT.</small>
            </span>
          </button>
          <button
            className="event-switch"
            onClick={() => notify("You’re exploring GitHub Universe 2026")}
          >
            <span className="event-logo">
              U<span>26</span>
            </span>
            <span>
              <strong>GitHub Universe</strong>
              <small>San Francisco · Oct 28–29</small>
            </span>
            <ChevronDown size={14} />
          </button>
          <span className="nav-caption">YOUR UNIVERSE</span>
          <nav>
            {nav.map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "active" : ""}
                onClick={() => go(n.id)}
              >
                <n.icon size={19} />
                {n.label}
                {n.id === "plan" && prefs.bookmarks.length > 0 ? (
                  <span className="nav-count">{prefs.bookmarks.length}</span>
                ) : null}
                {n.id === "graph" && <span className="new-tag">3D</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="private-note">
              <ShieldCheck size={19} />
              <strong>Your context. Your orbit.</strong>
              <p>
                Your plan and connections stay private. Only approved public
                program paths appear on stage.
              </p>
            </div>
            <button
              className="profile-button"
              onClick={() => setSettings(true)}
            >
              <span className="self-avatar">H</span>
              <span>
                <strong>Harsh Kadodwala</strong>
                <small>
                  {privateReady ? "Private · synced" : "Make it yours"}
                </small>
              </span>
              <Settings2 size={17} />
            </button>
          </div>
        </aside>
      )}
      <main className="main">
        {!stage && (
          <header className="topbar">
            <div className="breadcrumb">
              GitHub Universe <ChevronRight size={13} />
              <span>{nav.find((n) => n.id === view)?.label}</span>
            </div>
            <div className="top-actions">
              <div className="search-box">
                <Search size={16} />
                <input
                  id="global-search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (view === "today") setView("sessions");
                  }}
                  placeholder="Search your universe"
                  aria-label="Search sessions or people"
                />
                <kbd>⌘ K</kbd>
              </div>
              <span className="demo-badge">OFFICIAL PROGRAM</span>
              <button
                className="icon-button mobile-profile"
                onClick={() => setSettings(true)}
                aria-label="Your interests"
              >
                <Settings2 size={19} />
              </button>
            </div>
          </header>
        )}
        <div className="page-content">
          {view === "today" && (
            <>
              <div className="page-intro">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-dot" /> OCTOBER 28–29, 2026{" "}
                    <span className="intro-separator">/</span> SAN FRANCISCO
                  </div>
                  <h1>
                    Big ideas.
                    <br className="mobile-only" /> Better connections
                    <span className="lime-period">.</span>
                  </h1>
                  <p>
                    Find your people. Follow your curiosity. Make this one
                    count.
                  </p>
                </div>
                <button
                  className="outlined-button"
                  onClick={() => setSettings(true)}
                >
                  <Settings2 size={16} />
                  Your interests
                  <span className="interest-count">
                    {prefs.topicIds.length}
                  </span>
                </button>
              </div>
              <section className="hero-grid">
                <div className="globe-card">
                  <div className="globe-top">
                    <span className="pill dark-pill">
                      <span className={`status-dot ${data ? "live" : ""}`} />
                      {data
                        ? "YOUR UNIVERSE, CONNECTED"
                        : "EXPLORE YOUR UNIVERSE"}
                    </span>
                    <button
                      className="round-dark"
                      onClick={() => go("graph")}
                      aria-label="Expand the 3D graph"
                    >
                      <Expand size={17} />
                    </button>
                  </div>
                  <div className="hero-copy">
                    <h2>
                      Good things happen
                      <br />
                      when dots connect.
                    </h2>
                    <p>
                      One shared interest. A conversation.
                      <br />
                      Your next big thing starts here.
                    </p>
                    <button className="lime-button" onClick={() => go("graph")}>
                      Find your orbit <ArrowUpRight size={18} />
                    </button>
                    <div className="hero-community">
                      <span className="avatar-stack">
                        {people.slice(0, 3).map((p) => (
                          <Avatar key={p.id} person={p} size="small" />
                        ))}
                      </span>
                      <span>
                        A world of builders.
                        <br />
                        <strong>A few just like you.</strong>
                      </span>
                    </div>
                  </div>
                  <div className="hero-globe">
                    <Suspense
                      fallback={
                        <div className="graph-loading">
                          <LoaderCircle className="spin" />
                        </div>
                      }
                    >
                      <GraphScene
                        nodes={graph.nodes}
                        links={graph.links}
                        playing={playing}
                        onSelect={(n) => {
                          setSelected(n);
                          go("graph");
                          setSelected(n);
                        }}
                      />
                    </Suspense>
                  </div>
                  <div className="floating-label label-one">
                    <span className="label-light" />
                    AI & agents <span>↗</span>
                  </div>
                  <div className="floating-label label-two">
                    <Network size={13} /> A shared curiosity
                  </div>
                  <div className="globe-footer">
                    <span>
                      <span className="status-dot live" />
                      {data
                        ? `${data.counts.nodes} nodes · ${data.counts.edges} connections`
                        : `${graph.nodes.length} nodes · ${graph.links.length} connections`}
                    </span>
                    <span>
                      POWERED BY FALKORDB <ArrowUpRight size={12} />
                    </span>
                  </div>
                </div>
                <div className="plan-preview">
                  <div className="plan-preview-top">
                    <span className="eyebrow">YOUR FIELD NOTES</span>
                    <span className="little-sun">✳</span>
                  </div>
                  <h2>
                    A little intention.
                    <br />A lot of possibility.
                  </h2>
                  <p>
                    Your best conference isn’t the busiest one.
                    <br />
                    It’s the one that feels like you.
                  </p>
                  <div className="plan-stats">
                    <button onClick={() => go("plan")}>
                      <strong>
                        {String(prefs.bookmarks.length).padStart(2, "0")}
                      </strong>
                      <span>
                        sessions saved
                        <ArrowUpRight size={14} />
                      </span>
                    </button>
                    <button onClick={() => go("people")}>
                      <strong>
                        {String(prefs.met.length).padStart(2, "0")}
                      </strong>
                      <span>
                        people met
                        <ArrowUpRight size={14} />
                      </span>
                    </button>
                  </div>
                  <button className="dark-button" onClick={() => go("plan")}>
                    Build my day
                    <ArrowRight size={17} />
                  </button>
                  <span className="small-note">
                    <ShieldCheck size={12} /> A plan that’s only yours.
                  </span>
                </div>
              </section>
              <div className="interest-strip">
                <span>IN YOUR ORBIT</span>
                {topics
                  .filter((t) => prefs.topicIds.includes(t.id))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setFilter(t.id);
                        go("sessions");
                      }}
                    >
                      <span style={{ background: t.color }} />
                      {t.name}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                <button
                  className="edit-interests"
                  onClick={() => setSettings(true)}
                >
                  <Plus size={14} /> Refine interests
                </button>
              </div>
              {intelligence && (
                <div
                  className={`intelligence-state ${intelligence.status}`}
                  role="status"
                  data-testid="intelligence-state"
                  data-status={intelligence.status}
                  data-revision={intelligence.revision}
                >
                  {intelligence.status === "loading" ? (
                    <>
                      <LoaderCircle size={14} className="spin" />
                      Finding your next connection…
                    </>
                  ) : intelligence.status === "error" ? (
                    <>
                      <span>
                        {intelligence.error ||
                          "Recommendations are temporarily unavailable."}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          void onRetry?.().catch(() =>
                            notify("Could not retry. Please try again."),
                          )
                        }
                      >
                        Retry
                        <ArrowRight size={13} />
                      </button>
                    </>
                  ) : intelligence.status === "ready" ? (
                    <>
                      <Network size={13} />
                      {intelligence.source === "live"
                        ? "Recommendations from FalkorDB"
                        : "Official program preview"}
                    </>
                  ) : (
                    <>Preparing recommendations…</>
                  )}
                </div>
              )}
              <SectionTitle
                eyebrow="FOLLOW YOUR CURIOSITY"
                title="Worth a seat."
                action="All sessions"
                onAction={() => go("sessions")}
              />
              <div className="sessions-grid">
                {suggested.slice(0, 3).map((t) => talkCard(t))}
                {suggested.length === 0 &&
                  (!intelligence || intelligence.status === "ready") && (
                    <div className="empty-state">
                      <Compass />
                      <h3>A little direction goes a long way.</h3>
                      <p>
                        Choose some interests to find sessions in your orbit.
                      </p>
                      <button
                        className="dark-button"
                        onClick={() => setSettings(true)}
                      >
                        Choose interests
                      </button>
                    </div>
                  )}
              </div>
              <SectionTitle
                eyebrow="SKIP THE SMALL TALK"
                title="Your kind of people."
                action="Meet your people"
                onAction={() => go("people")}
              />
              <div className="people-strip">
                {people
                  .filter((p) =>
                    intelligence
                      ? intelligence.status === "ready" &&
                        intelligence.people.some(
                          (result) =>
                            result.personId.replace("demo:", "") === p.id,
                        )
                      : p.topicIds.some((id) => prefs.topicIds.includes(id)),
                  )
                  .slice(0, 3)
                  .map((p) => (
                    <button
                      className="person-mini"
                      key={p.id}
                      onClick={() => setPerson(p)}
                    >
                      <Avatar person={p} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.role} · {p.company}
                        </small>
                        <span className="mutual">
                          <span className="tiny-dot" />
                          {
                            p.topicIds.filter((id) =>
                              prefs.topicIds.includes(id),
                            ).length
                          }{" "}
                          shared interests
                        </span>
                      </span>
                      <ArrowUpRight size={19} />
                    </button>
                  ))}
              </div>
            </>
          )}
          {view === "sessions" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="eyebrow">
                    A LITTLE CURIOSITY GOES A LONG WAY
                  </span>
                  <h1>
                    Find your next idea<span className="lime-period">.</span>
                  </h1>
                  <p>Talks, workshops, and the moments that stay with you.</p>
                </div>
              </div>
              <div className="filter-toolbar">
                <div className="segmented">
                  {[1, 2].map((d) => (
                    <button
                      className={day === d ? "selected" : ""}
                      key={d}
                      onClick={() => setDay(d)}
                    >
                      Day {d}
                      <span>Oct {d + 27}</span>
                    </button>
                  ))}
                </div>
                <span className="result-count">{filtered.length} sessions</span>
              </div>
              <div className="filter-chips">
                <button
                  className={filter === "all" ? "selected" : ""}
                  onClick={() => setFilter("all")}
                >
                  All tracks
                </button>
                {topics.map((t) => (
                  <button
                    key={t.id}
                    className={filter === t.id ? "selected" : ""}
                    onClick={() => setFilter(t.id)}
                  >
                    <span style={{ background: t.color }} />
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="sessions-grid">
                {filtered.map((t) => talkCard(t))}
              </div>
              {filtered.length === 0 && (
                <div className="empty-state">
                  <Search />
                  <h3>No sessions in this orbit.</h3>
                  <p>Try another search or track.</p>
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="dark-button"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
          {view === "people" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="eyebrow">MAKE ROOM FOR SERENDIPITY</span>
                  <h1>
                    People, not profiles<span className="lime-period">.</span>
                  </h1>
                  <p>A shared curiosity is a pretty good place to start.</p>
                </div>
                <span className="outlined-label">
                  <ShieldCheck size={15} /> Sourced demo personas
                </span>
              </div>
              <div className="people-grid">
                {displayPeople.map((p) => (
                  <article className="person-card" key={p.id}>
                    <div className="person-card-top">
                      <Avatar person={p} size="large" />
                      <button
                        className={`icon-button ${prefs.met.includes(p.id) ? "met" : ""}`}
                        onClick={() => change("met", p.id)}
                        aria-label={`${prefs.met.includes(p.id) ? "Remove connection with" : "Remember meeting"} ${p.name}`}
                      >
                        <CheckCheck size={21} />
                      </button>
                    </div>
                    <h3>{p.name}</h3>
                    <p>
                      {p.role}
                      <br />
                      {p.company}
                    </p>
                    <span className="city">
                      <MapPin size={13} />
                      {p.city}
                    </span>
                    <div className="person-topics">
                      {p.topicIds.map((id) => (
                        <span
                          key={id}
                          style={{
                            background: topics.find((t) => t.id === id)?.color,
                          }}
                        >
                          {topics.find((t) => t.id === id)?.name}
                        </span>
                      ))}
                    </div>
                    <button
                      className="person-action"
                      onClick={() => setPerson(p)}
                    >
                      {prefs.met.includes(p.id)
                        ? "Pick up the conversation"
                        : "Find your common ground"}
                      <ArrowUpRight size={18} />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {view === "plan" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="eyebrow">LESS FOMO. MORE FLOW.</span>
                  <h1>
                    A day that feels like you
                    <span className="lime-period">.</span>
                  </h1>
                  <p>
                    {prefs.bookmarks.length} saved sessions · {prefs.met.length}{" "}
                    remembered connections · all yours.
                  </p>
                </div>
                <button
                  className="outlined-button"
                  onClick={() => {
                    const items = talks.filter((t) =>
                      prefs.bookmarks.includes(t.id),
                    );
                    if (!items.length) {
                      notify("Save a session first to export your plan.");
                      return;
                    }
                    const ics = [
                      "BEGIN:VCALENDAR",
                      "VERSION:2.0",
                      "PRODID:-//ConferenceOS//Demo//EN",
                      ...items.flatMap((t) => [
                        "BEGIN:VEVENT",
                        `UID:${t.id}@conferenceos.demo`,
                        `DTSTAMP:20261024T000000Z`,
                        `DTSTART;TZID=America/Los_Angeles:202610${t.day + 27}T${t.time.replace(":", "")}00`,
                        `DTEND;TZID=America/Los_Angeles:202610${t.day + 27}T${t.end.replace(":", "")}00`,
                        `SUMMARY:${t.title.replace(/[\\,;]/g, " ")}`,
                        `LOCATION:${rooms.find((r) => r.id === t.roomId)?.name}`,
                        "END:VEVENT",
                      ]),
                      "END:VCALENDAR",
                    ].join("\r\n");
                    const url = URL.createObjectURL(
                      new Blob([ics], { type: "text/calendar" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "conferenceos-universe-plan.ics";
                    a.click();
                    URL.revokeObjectURL(url);
                    notify("Calendar exported");
                  }}
                >
                  <CalendarDays size={16} />
                  Export calendar
                </button>
              </div>
              {prefs.bookmarks.length === 0 ? (
                <div className="empty-state plan-empty">
                  <div className="empty-icon">
                    <Bookmark size={31} />
                  </div>
                  <h2>Leave room for a great day.</h2>
                  <p>
                    Save the sessions that spark something.
                    <br />
                    We’ll keep them together right here.
                  </p>
                  <button
                    className="dark-button"
                    onClick={() => go("sessions")}
                  >
                    Explore sessions
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="agenda">
                  {[1, 2].map((d) => {
                    const list = talks.filter(
                      (t) => t.day === d && prefs.bookmarks.includes(t.id),
                    );
                    return list.length > 0 ? (
                      <section key={d}>
                        <h2>
                          {d === 1 ? "Wednesday" : "Thursday"}
                          <span>
                            Oct {27 + d} · Day {d}
                          </span>
                        </h2>
                        {list.map((t) => (
                          <div className="agenda-row" key={t.id}>
                            <span className="agenda-time">
                              {t.time}
                              <small>{t.end}</small>
                            </span>
                            <span className="agenda-dot" />
                            <button onClick={() => setDetail(t)}>
                              <small>
                                {t.track} ·{" "}
                                {rooms.find((r) => r.id === t.roomId)?.name}
                              </small>
                              <h3>{t.title}</h3>
                              <span>{speakerFor(t).name}</span>
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => change("bookmark", t.id)}
                              aria-label={`Remove ${t.title}`}
                            >
                              <Bookmark size={19} fill="currentColor" />
                            </button>
                          </div>
                        ))}
                      </section>
                    ) : null;
                  })}
                </div>
              )}
              {prefs.met.length > 0 && (
                <>
                  <SectionTitle title="Conversations to continue." />
                  <div className="people-strip">
                    {people
                      .filter((p) => prefs.met.includes(p.id))
                      .map((p) => (
                        <button
                          className="person-mini"
                          key={p.id}
                          onClick={() => setPerson(p)}
                        >
                          <Avatar person={p} />
                          <span>
                            <strong>{p.name}</strong>
                            <small>{p.company}</small>
                          </span>
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
          {view === "graph" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="eyebrow">EVERY ANSWER HAS A PATH</span>
                  <h1>
                    {stage ? "A shared perspective" : "A world of connections"}
                    <span className="lime-period">.</span>
                  </h1>
                  <p>
                    {stage
                      ? "Public program paths approved on a paired phone."
                      : "Explore the relationships behind your recommendations."}
                  </p>
                </div>
                <button
                  className="outlined-button"
                  data-testid="stage-toggle"
                  onClick={toggleStage}
                >
                  <Expand size={16} />
                  {stage ? "Exit stage mode" : "Stage mode"}
                </button>
              </div>
              <section
                className="explorer"
                data-testid="graph-explorer"
                data-proof-revision={
                  stage || hasPresentation
                    ? (presentation?.revision ?? "")
                    : (intelligence?.revision ?? "")
                }
                data-proof-node-ids={JSON.stringify(
                  currentProof?.traversalNodeIds ?? [],
                )}
                data-proof-edge-ids={JSON.stringify(
                  currentProof?.edges.map((edge) => edge.id) ?? [],
                )}
                data-animation-complete={animationComplete ? "true" : "false"}
              >
                <div className="explorer-canvas">
                  <div className="explorer-header">
                    <span className="pill dark-pill">
                      <span
                        className={`status-dot ${presentation?.status === "live" ? "live" : ""}`}
                      />
                      {presentation?.status === "live"
                        ? "LIVE PAIRED PATH"
                        : presentation?.status === "disconnected"
                          ? "CONNECTION PAUSED"
                          : data
                            ? "PUBLIC GRAPH SNAPSHOT"
                            : "PUBLIC PROGRAM PREVIEW"}
                    </span>
                    <button
                      className="round-dark"
                      onClick={() => setPlaying(!playing)}
                      aria-label={
                        playing ? "Pause rotation" : "Resume rotation"
                      }
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  </div>
                  <Suspense
                    fallback={
                      <div className="graph-loading">
                        <LoaderCircle className="spin" />
                      </div>
                    }
                  >
                    <GraphScene
                      nodes={graph.nodes}
                      links={graph.links}
                      selected={highlighted}
                      proof={currentProof}
                      animationKey={proofKey}
                      onProofComplete={() => setAnimationComplete(true)}
                      onSelect={
                        stage
                          ? undefined
                          : (n) => {
                              setSelected(n);
                              setActiveProof(null);
                            }
                      }
                      playing={playing}
                    />
                  </Suspense>
                  <div className="explorer-legend">
                    {["Talk", "Speaker", "Topic", "Room"].map((kind, index) => (
                      <span key={kind}>
                        <i
                          style={{
                            background: [
                              "#c5f87c",
                              "#bca7ff",
                              "#ffd383",
                              "#80d5eb",
                            ][index],
                          }}
                        />
                        {kind}
                      </span>
                    ))}
                  </div>
                  <span className="drag-hint">
                    Drag to find a new perspective
                  </span>
                </div>
                {stage ? (
                  <aside className="stage-presentation-inspector">
                    <PresentationPanel
                      bridge={presentation}
                      stage
                      animationComplete={animationComplete}
                    />
                  </aside>
                ) : (
                  <div className="graph-inspector">
                    <span className="eyebrow">THE BIGGER PICTURE</span>
                    <h2>
                      {selected ? selected.label : "Connected by curiosity."}
                    </h2>
                    <p>
                      {selected
                        ? `${selected.kind} · ${graph.links.filter((link) => link.source === selected.id || link.target === selected.id).length} visible relationships`
                        : "Public sessions, speakers, topics, and rooms. Choose a node to see where it leads."}
                    </p>
                    <div className="graph-totals">
                      <span>
                        <strong>{graph.nodes.length}</strong>nodes
                      </span>
                      <span>
                        <strong>{graph.links.length}</strong>connections
                      </span>
                    </div>
                    <PresentationPanel
                      bridge={presentation}
                      animationComplete={animationComplete}
                    />
                    {!hasPresentation && (
                      <>
                        <span className="eyebrow">TRY AN EXPLAINABLE PATH</span>
                        {suggested.slice(0, 3).map((talk) => (
                          <button
                            key={talk.id}
                            className="graph-suggestion"
                            onClick={() => {
                              const recommendation = reason(talk);
                              setActiveProof(recommendation.proof ?? null);
                              setExplain(recommendation);
                            }}
                          >
                            <Network size={16} />
                            <span>{talk.title}</span>
                            <ArrowUpRight size={16} />
                          </button>
                        ))}
                        {currentProof && <ProofTrail proof={currentProof} />}
                      </>
                    )}
                    <div className="graph-privacy">
                      <ShieldCheck size={17} />
                      <p>
                        Stage mode shows the public program and paths explicitly
                        approved on a paired phone. Private plans, meetings and
                        profiles stay off stage.
                      </p>
                    </div>
                    <a
                      className="text-button"
                      href="https://browser.falkordb.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open FalkorDB Browser
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
              </section>
              {!stage && (
                <div className="query-card">
                  <div>
                    <span className="eyebrow">THE PUBLIC PATH, IN CYPHER</span>
                    <h3>No black box. Just connections.</h3>
                  </div>
                  <code>{publicPathCypher}</code>
                  <button
                    className="outlined-button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(publicPathCypher)
                        .then(() => notify("Cypher copied"))
                        .catch(() =>
                          notify("Copy isn’t available in this browser"),
                        )
                    }
                  >
                    <Copy size={15} />
                    Copy query
                  </button>
                </div>
              )}
            </>
          )}
          {!stage && (
            <footer className="page-footer">
              <span>
                <OrbMark small /> Built for the connections that matter.
              </span>
              <span className="footer-status">
                <span className={`status-dot ${data ? "live" : ""}`} />
                {status}
              </span>
              <span>Official program · demo networking</span>
            </footer>
          )}
        </div>
      </main>
      {!stage && (
        <nav className="mobile-nav">
          {nav.map((n) => (
            <button
              className={view === n.id ? "active" : ""}
              key={n.id}
              onClick={() => go(n.id)}
            >
              <n.icon size={21} />
              <span>{n.id === "graph" ? "Orbit" : n.label}</span>
            </button>
          ))}
        </nav>
      )}
      {!stage && (toast || error) && (
        <div className={`toast ${error ? "error" : ""}`} role="status">
          {error ? <X size={16} /> : <Check size={16} />}
          <span>{error || toast}</span>
          <button
            onClick={() => {
              clearError();
              setToast("");
            }}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {!stage && detail && (
        <Modal onClose={() => setDetail(null)}>
          <div className="detail-art" style={{ background: detail.color }}>
            <span className="pill">{detail.track}</span>
            <span className="art-orbits">
              <i />
              <i />
              <i />
            </span>
            <span className="eyebrow">A NEW PERSPECTIVE STARTS HERE</span>
          </div>
          <div className="modal-body">
            <span className="eyebrow">
              DAY {detail.day} · {detail.format.toUpperCase()} · OFFICIAL
              SESSION
            </span>
            <h2>{detail.title}</h2>
            <p>{detail.subtitle} </p>
            <div className="detail-speaker">
              <Avatar person={speakerFor(detail)} />
              <span>
                <strong>{speakerFor(detail).name}</strong>
                <small>
                  {speakerFor(detail).role} · {speakerFor(detail).company}
                </small>
              </span>
            </div>
            <div className="detail-metadata">
              <span>
                <Clock size={17} />
                {detail.time} – {detail.end}
              </span>
              <span>
                <MapPin size={17} />
                {rooms.find((r) => r.id === detail.roomId)?.name}
              </span>
            </div>
            <a
              className="official-source"
              href={detail.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              Official Universe program · {detail.date} · PDT
            </a>
            <div className="modal-actions">
              <button
                className="dark-button"
                disabled={pending === detail.id}
                onClick={() => change("bookmark", detail.id)}
              >
                {prefs.bookmarks.includes(detail.id) ? (
                  <Check size={17} />
                ) : (
                  <Plus size={17} />
                )}{" "}
                {prefs.bookmarks.includes(detail.id)
                  ? "In your plan"
                  : "Add to my plan"}
              </button>
              {detail.topicIds.length > 0 && detail.speakerId && (
                <button
                  className="outlined-button"
                  onClick={() => {
                    setExplain(reason(detail));
                    setDetail(null);
                  }}
                >
                  <Network size={16} />
                  Why this session?
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {!stage && person && (
        <Modal onClose={() => setPerson(null)}>
          <div className="modal-body person-detail">
            <span className="eyebrow">
              PUBLIC PROFESSIONAL PROFILE · DEMO PERSONA
            </span>
            <Avatar person={person} size="large" />
            <h2>{person.name}</h2>
            <p>
              {person.role} at {person.company}
              <br />
              {person.city}
            </p>
            <div className="profile-provenance">
              <a href={person.profileUrl} target="_blank" rel="noreferrer">
                View LinkedIn profile <ExternalLink size={13} />
              </a>
              <small>
                Public indexed information · attendance unconfirmed
                <br />
                Event interests below are synthetic demo choices.
              </small>
              {person.hiring.status === "public-post-found" && (
                <a
                  href={person.hiring.sourceUrl ?? person.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Hiring post found · current openings unverified{" "}
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
            <div className="conversation-starter">
              <span className="eyebrow">YOUR CONVERSATION STARTER</span>
              <p>
                “What are you building with{" "}
                {topics.find(
                  (t) =>
                    person.topicIds.includes(t.id) &&
                    prefs.topicIds.includes(t.id),
                )?.name ??
                  topics.find((t) => person.topicIds.includes(t.id))?.name}{" "}
                right now?”
              </p>
            </div>
            <div className="path-trail">
              <span>You</span>
              <ArrowRight size={15} />
              <span>
                {topics.find((t) => person.topicIds.includes(t.id))?.name}
              </span>
              <ArrowRight size={15} />
              <span>{person.name.split(" ")[0]}</span>
            </div>
            <button
              className="dark-button"
              disabled={pending === person.id}
              onClick={() => change("met", person.id)}
            >
              <CheckCheck size={18} />
              {prefs.met.includes(person.id)
                ? "You’ve met · undo"
                : "We met — remember this"}
            </button>
            <p className="privacy-caption">
              <ShieldCheck size={13} /> This connection stays in your private
              memory.
            </p>
          </div>
        </Modal>
      )}
      {!stage && settings && (
        <Modal onClose={() => setSettings(false)}>
          <div className="modal-body interests-modal">
            <span className="eyebrow">LET CURIOSITY LEAD</span>
            <span className="interest-art">✳</span>
            <h2>What’s in your orbit?</h2>
            <p>
              Pick the things you could talk about for hours.
              <br />
              We’ll help you find the right rooms and people.
            </p>
            <div className="interest-options">
              {topics.map((t) => (
                <button
                  key={t.id}
                  disabled={pending === "interests"}
                  className={prefs.topicIds.includes(t.id) ? "selected" : ""}
                  onClick={() =>
                    change(
                      "interest",
                      prefs.topicIds.includes(t.id)
                        ? prefs.topicIds.filter((id) => id !== t.id)
                        : [...prefs.topicIds, t.id],
                    )
                  }
                >
                  <span style={{ background: t.color }} />
                  {t.name}
                  {prefs.topicIds.includes(t.id) ? (
                    <Check size={18} />
                  ) : (
                    <Plus size={18} />
                  )}
                </button>
              ))}
            </div>
            <button
              className="dark-button full-width"
              onClick={() => setSettings(false)}
            >
              Find my people
              <ArrowRight size={17} />
            </button>
            <p className="privacy-caption">
              <ShieldCheck size={13} /> Your choices are private. Change them
              whenever.
            </p>
          </div>
        </Modal>
      )}
      {!stage && explain && (
        <Modal onClose={() => setExplain(null)}>
          <div className="modal-body explain-modal">
            <span className="eyebrow">
              {explain.proof && intelligence?.source === "live"
                ? "RETURNED FALKORDB PATH"
                : "PUBLIC PROGRAM PREVIEW"}
            </span>
            <div className="explain-icon">
              <Network size={28} />
            </div>
            <h2>Here’s how the dots connect.</h2>
            <p>
              {explain.proof
                ? "These are the exact nodes and directed relationships returned for this recommendation."
                : "This relationship comes from the bundled official program. A live graph proof is not available."}
            </p>
            {explain.proof ? (
              <ProofTrail proof={explain.proof} />
            ) : (
              <div className="path-trail">
                {explain.path.slice(1).map((label, index) => (
                  <span key={`${index}-${label}`}>{label}</span>
                ))}
              </div>
            )}
            <button
              className="dark-button full-width"
              disabled={!explain.proof || hasPresentation}
              onClick={() => {
                const proof = explain.proof;
                setExplain(null);
                go("graph");
                setActiveProof(proof ?? null);
              }}
            >
              Trace this path in 3D
              <ArrowUpRight size={17} />
            </button>
            <span className="small-note">
              {hasPresentation
                ? "End phone sharing to trace a private recommendation."
                : explain.proof && intelligence?.source === "live"
                  ? "Your choice of interest remains private. Only the public graph path is traced."
                  : "Preview relationships are labeled separately from live graph results."}
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const els = root.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", trap);
      prev?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Conference details"
        ref={root}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={19} />
        </button>
        {children}
      </div>
    </div>
  );
}
