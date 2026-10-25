import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useAction,
  useConvexAuth,
  useConvexConnectionState,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Maximize2,
  Pause,
  Play,
  Smartphone,
  X,
  ChevronDown,
  Orbit,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { demoGraph } from "../../../packages/core/demoGraph";
import { isRedactedSocialProof } from "../../../packages/core/social";
import { validSharedContextGraph } from "../../../packages/core/network";
import {
  ProofTrail,
  usePresentation,
  useBrowserOnline,
  publicKinds,
} from "./PresentationPanel";
import type { GraphNode, GraphLink } from "./GraphScene";
import "./globe.css";
import {topicFocus} from '../../../packages/core/graphFocus';
const GraphScene = lazy(() => import("./GraphScene"));
const fallback = {
  nodes: demoGraph.nodes.filter((n) => publicKinds.has(n.kind)),
  links: demoGraph.links.filter((l) =>
    ["ABOUT", "PRESENTS", "IN_ROOM"].includes(l.kind),
  ),
};

export default function GlobeApp({ connected }: { connected: boolean }) {
  return connected ? (
    <ConnectedGlobe />
  ) : (
    <main className="globe-only">
      <div className="globe-brand">
        ◉{" "}
        <span>
          conference<span>os</span>
        </span>
      </div>
      <div className="globe-stage">
        <Suspense fallback={null}>
          <GraphScene {...fallback} />
        </Suspense>
      </div>
      <p className="globe-caption">
        Public program preview · configure Convex to pair a phone
      </p>
    </main>
  );
}
function ConnectedGlobe() {
  const { isAuthenticated, isLoading } = useConvexAuth(),
    { signIn } = useAuthActions();
  const bootstrap = useAction(api.graph.publicSnapshot),
    bridge = usePresentation(isAuthenticated);
  const ws = useConvexConnectionState(),
    browserOnline = useBrowserOnline(),
    online = ws.isWebSocketConnected && browserOnline;
  const [graph, setGraph] = useState<{
    nodes: GraphNode[];
    links: GraphLink[];
  }>(fallback);
  const [graphLive, setGraphLive] = useState(false),
    [mode, setMode] = useState<"conference" | "personal">("conference"),
    [controls, setControls] = useState(false),
    [playing, setPlaying] = useState(true),
    [traced, setTraced] = useState(false),
    [selection, setSelection] = useState<GraphNode | null>(null),
    [authError, setAuthError] = useState("");
  const [category,setCategory]=useState('');
  const categories=graph.nodes.filter(n=>n.kind==='Topic');
  const categoryColors=['#bc9bff','#9bf2cf','#ffb6d2','#9bc9ff','#e7ec9a','#f5c59b'];
  const focus=useMemo(()=>mode==='conference'?topicFocus(graph.nodes,graph.links,category):{ids:[],edges:[]},[mode,graph,category]);
  const focusColor=categoryColors[Math.max(0,categories.findIndex(n=>n.id===category))%categoryColors.length];
  const authStarted = useRef(false);
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !authStarted.current) {
      authStarted.current = true;
      void signIn("anonymous").catch(() =>
        setAuthError("Connection unavailable. Reload to retry."),
      );
    }
  }, [isAuthenticated, isLoading, signIn]);
  useEffect(() => {
    let active = true;
    void bootstrap({})
      .then((data) => {
        if (active) {
          setGraph(data);
          setGraphLive(true);
        }
      })
      .catch(() => {
        if (active) setGraphLive(false);
      });
    return () => {
      active = false;
    };
  }, [bootstrap]);
  const social = useQuery(
    api.social.stage,
    isAuthenticated && bridge.sessionId
      ? { sessionId: bridge.sessionId }
      : "skip",
  );
  const active =
    online &&
    !!bridge.session &&
    bridge.session.expiresAt > Date.now() &&
    !["revoked", "expired", "unavailable", "disconnected"].includes(
      bridge.status,
    );
  const shared = active ? social : null;
  const network = useQuery(api.network.stage, isAuthenticated && bridge.sessionId ? { sessionId: bridge.sessionId } : "skip");
  const context = active && network?.graph && validSharedContextGraph(network.graph) ? network.graph : null;
  const privateProof =
    shared?.kind === "opportunity" &&
    shared.proof &&
    isRedactedSocialProof(shared.proof)
      ? shared.proof
      : null;
  const proof = mode === "personal" ? privateProof : bridge.proof;
  const key =
    mode === "personal"
      ? `social:${shared?.revision ?? 0}:network:${network?.revision ?? 0}:${active}`
      : `public:${bridge.revision ?? 0}`;
  useEffect(() => {
    setTraced(false);
    setSelection(null);
  }, [key, mode]);
  useEffect(() => {
    if (shared?.kind === "connection" || shared?.kind === "opportunity")
      setMode("personal");
  }, [shared?.revision, shared?.kind]);
  useEffect(() => { if (context) setMode("personal"); }, [network?.revision]);
  const pulse = shared?.kind === "connection";
  const livePath = !!proof && online;
  return (
    <main className="globe-only">
      <div className="globe-aurora" aria-hidden="true" />
      <header className="globe-header">
        <div className="globe-brand">
          <Orbit size={25} />
          <span>
            conference<span>os</span>
          </span>
        </div>
        <div className="globe-switch" role="group" aria-label="Globe scope">
          <button
            aria-pressed={mode === "conference"}
            onClick={() => setMode("conference")}
          >
            Conference
          </button>
          <button
            aria-pressed={mode === "personal"}
            onClick={() => setMode("personal")}
          >
            Personal
          </button>
        </div>
        <button
          className="globe-pair"
          aria-expanded={controls}
          onClick={() => setControls(!controls)}
        >
          <Smartphone size={16} />
          {active ? "Sharing on" : "Share view"}
          <ChevronDown size={13} />
        </button>
      </header>
      {mode==='conference'&&<nav className="graph-categories" aria-label="Explore conference categories">
        <button aria-pressed={!category} onClick={()=>setCategory('')}>Everything</button>
        {categories.map((n,i)=><button key={n.id} aria-pressed={category===n.id} style={{'--category-color':categoryColors[i%categoryColors.length]} as React.CSSProperties} onClick={()=>{setCategory(category===n.id?'':n.id);setSelection(null);}}><i/>{n.label}</button>)}
        {!!category&&<small>{focus.ids.length} connected people, sessions & topics · tap a node</small>}
      </nav>}
      <div
        className="globe-stage"
        data-testid="graph-explorer"
        data-scope={mode}
        data-proof-node-ids={JSON.stringify(proof?.traversalNodeIds ?? [])}
        data-network-count={shared?.networkCount ?? 0}
        data-animation-complete={traced}
        data-context-nodes={mode === "personal" ? context?.nodes.length ?? 0 : 0}
        data-context-edges={mode === "personal" ? context?.edges.length ?? 0 : 0}
        data-context-revision={network?.revision ?? 0}
        data-category={category} data-category-node-count={focus.ids.length} data-category-link-count={focus.edges.length}
      >
        <div className="globe-halo" />
        {pulse && (
          <div
            key={shared.revision}
            className="network-burst"
            data-testid="network-burst"
            aria-label="A new connection joined your network"
          />
        )}
        <Suspense
          fallback={<div className="globe-loading">Opening your orbit…</div>}
        >
          <GraphScene
            nodes={mode === "conference" ? graph.nodes : []}
            links={mode === "conference" ? graph.links : []}
            networkCount={
              mode === "personal" && !privateProof
                ? (shared?.networkCount ?? 0)
                : 0
            }
            proof={online ? proof : null}
            contextGraph={mode === "personal" && !privateProof ? context : null}
            animationKey={key}
            playing={playing}
            selected={focus.ids} focusLinks={focus.edges} focusColor={focusColor}
            onSelect={setSelection}
            onProofComplete={() => setTraced(true)}
          />
        </Suspense>
      </div>
      <div className="globe-heading">
        <span>
          {mode === "conference"
            ? "GITHUB UNIVERSE · SAN FRANCISCO"
            : "YOUR PERSONAL ORBIT"}
        </span>
        <h1>
          {mode === "conference"
            ? "A universe of possibility."
            : privateProof
              ? "The right moment to reconnect."
              : pulse
                ? "Your world just grew."
                : "Good connections go further."}
        </h1>
      </div>
      {selection && !controls && !livePath && (
        <section className="globe-node-label" aria-label="Node details">
          <button aria-label="Close node details" onClick={() => setSelection(null)}><X size={14} /></button>
          <strong>{selection.label}</strong>
          <small>{selection.kind.startsWith("Shared") ? "Anonymous shared context · verified graph" : selection.kind + " · public program"}</small>
          <p>{(mode === "personal" ? context?.edges ?? [] : graph.links).filter(e => e.source === selection.id || e.target === selection.id).length} direct relationships</p>
          <small>{[...new Set((mode === "personal" ? context?.edges ?? [] : graph.links).filter(e => e.source === selection.id || e.target === selection.id).map(e => e.kind))].join(" · ")}</small>
          {mode === "personal" && <p>Names, topics and notes remain private. Open the node on your phone for details.</p>}
        </section>
      )}
      {livePath && (
        <div
          className="globe-path"
          data-testid="presentation-panel"
          data-status="live"
          data-revision={
            mode === "personal" ? shared?.revision : bridge.revision
          }
          data-animation-complete={traced}
        >
          <span className="globe-path-status">
            <i />
            {traced ? "Path connected" : "Tracing your connection"}
          </span>
          <ProofTrail proof={proof!} />
        </div>
      )}
      {controls && (
        <section className="globe-popover" aria-label="Phone pairing">
          <button
            className="globe-close"
            onClick={() => setControls(false)}
            aria-label="Close pairing"
          >
            <X size={17} />
          </button>
          <span className="globe-overline">PHONE → GLOBE</span>
          <h2>
            {bridge.status === "waiting"
              ? "Bring your orbit here."
              : active
                ? "Connected, on your terms."
                : "Pair your phone."}
          </h2>
          {bridge.status === "waiting" && bridge.code ? (
            <>
              <output className="globe-code" data-testid="pairing-code">
                {bridge.code}
              </output>
              <p>
                On mobile, open your profile → Share to desktop. Choose what to
                share.
              </p>
              <small>Single use · expires in 5 minutes</small>
            </>
          ) : (
            <p>
              {active
                ? "Share an anonymized context graph, a public session path, or a redacted opportunity path from your phone. Each has its own approval."
                : "Your phone stays private. Only the activity you approve appears on this globe."}
            </p>
          )}
          {authError || bridge.error ? (
            <p role="alert">{authError || bridge.error}</p>
          ) : null}
          {!active || bridge.status === "waiting" ? (
            <button
              className="globe-primary"
              data-testid="pair-phone"
              disabled={!bridge.ready || !online || bridge.working}
              onClick={() => void bridge.create()}
            >
              {bridge.status === "waiting" ? "New code" : "Create pairing code"}
            </button>
          ) : (
            <button
              className="globe-primary"
              data-testid="revoke-presentation"
              disabled={!online || bridge.working}
              onClick={() => void bridge.revoke()}
            >
              End sharing
            </button>
          )}
          <div className="globe-privacy">
            <ShieldCheck size={13} />
            Names and conversation text stay on your phone.
          </div>
        </section>
      )}
      <footer className="globe-footer">
        <div className="globe-connection">
          <i className={online ? "online" : ""} />
          {!online
            ? "Disconnected · highlights paused"
            : bridge.status === "expired"
              ? "Sharing session expired"
              : bridge.status === "revoked"
                ? "Sharing ended"
                : mode === "personal"
                  ? context
                    ? `${context.nodes.length} shared moments · ${context.edges.length} connections`
                    : shared
                    ? `${shared.networkCount} anonymous connections`
                    : "Pair a phone to share your network"
                  : graphLive
                    ? "Live conference network"
                    : "Public program preview"}
        </div>
        <span>Drag to explore</span>
        <div className="globe-tools">
          <button
            aria-label={playing ? "Pause rotation" : "Resume rotation"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            aria-label="Enter fullscreen"
            onClick={() => {
              if (!document.fullscreenElement)
                void document.documentElement
                  .requestFullscreen?.()
                  .catch(() => {});
              else void document.exitFullscreen?.();
            }}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </footer>
    </main>
  );
}
