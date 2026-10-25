import { useEffect, useState } from "react";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import {
  LoaderCircle,
  Network,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  DesktopPresentation,
  GraphProof,
} from "../../../packages/core/intelligence";
import { isPublicProof } from "../../../packages/core/intelligence";
import { isRedactedSocialProof } from "../../../packages/core/social";
export const publicKinds = new Set(["Talk", "Speaker", "Topic", "Room"]);
export const edgeKey = (edge: {
  source: string;
  target: string;
  kind: string;
}) => JSON.stringify([edge.source, edge.kind, edge.target]);
/** Follow returned traversal order while preserving each returned edge's direction. */
export function orderedProofEdges(proof: GraphProof | null | undefined) {
  if (
    !proof ||
    !(isPublicProof(proof) || isRedactedSocialProof(proof)) ||
    proof.traversalNodeIds.length !== proof.edges.length + 1
  )
    return [];
  const used = new Set<string>();
  const result: {
    edge: GraphProof["edges"][number];
    from: string;
    to: string;
    reverse: boolean;
  }[] = [];
  for (let i = 0; i < proof.traversalNodeIds.length - 1; i++) {
    const from = proof.traversalNodeIds[i],
      to = proof.traversalNodeIds[i + 1];
    const edge = proof.edges.find(
      (candidate) =>
        !used.has(candidate.id) &&
        ((candidate.source === from && candidate.target === to) ||
          (candidate.source === to && candidate.target === from)),
    );
    if (
      !edge ||
      !proof.nodes.some((node) => node.id === from) ||
      !proof.nodes.some((node) => node.id === to)
    )
      return [];
    used.add(edge.id);
    result.push({ edge, from, to, reverse: edge.source !== from });
  }
  return result;
}

const STORAGE = "conferenceos:presentation:v1";
type StoredPresentation = {
  sessionId: Id<"presentations">;
  code?: string;
  codeExpiresAt?: number;
};
function storedPresentation(): StoredPresentation | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "null");
  } catch {
    return null;
  }
}
/** Browser offline events arrive before a WebSocket heartbeat detects a loss. */
export function useBrowserOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  return online;
}
export function usePresentation(isAuthenticated: boolean) {
  const [stored, setStored] = useState<StoredPresentation | null>(
    storedPresentation,
  );
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now);
  const connection = useConvexConnectionState();
  const browserOnline = useBrowserOnline();
  const createSession = useMutation(api.presentation.create),
    revokeSession = useMutation(api.presentation.revoke);
  const session = useQuery(
    api.presentation.desktop,
    isAuthenticated && stored ? { sessionId: stored.sessionId } : "skip",
  ) as DesktopPresentation | null | undefined;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (stored) localStorage.setItem(STORAGE, JSON.stringify(stored));
    else localStorage.removeItem(STORAGE);
  }, [stored]);
  useEffect(() => {
    if (stored?.code && session && session.status !== "waiting")
      setStored({ sessionId: stored.sessionId });
  }, [session, stored]);
  const connected = browserOnline && connection.isWebSocketConnected;
  const terminal =
    session?.status === "expired" || session?.status === "revoked";
  const locallyExpired = Boolean(
    session &&
    (session.expiresAt <= now ||
      (session.status === "waiting" && session.codeExpiresAt <= now)),
  );
  const status = !stored
    ? "unpaired"
    : !connected
      ? "disconnected"
      : !isAuthenticated || session === undefined
        ? "connecting"
        : session === null
          ? "unavailable"
          : locallyExpired
            ? "expired"
            : session.status;
  const proof =
    status === "live" &&
    session?.proof &&
    orderedProofEdges(session.proof).length
      ? session.proof
      : null;
  async function create() {
    if (working || !isAuthenticated || !connected) return;
    setWorking(true);
    setError("");
    try {
      if (stored && !terminal)
        await revokeSession({ sessionId: stored.sessionId });
      const next = await createSession({});
      setStored({
        sessionId: next.sessionId,
        code: next.code,
        codeExpiresAt: next.codeExpiresAt,
      });
    } catch {
      setError("Could not create a pairing code. Try again.");
    } finally {
      setWorking(false);
    }
  }
  async function revoke() {
    if (!stored || working) return;
    setWorking(true);
    setError("");
    try {
      await revokeSession({ sessionId: stored.sessionId });
      setStored({ sessionId: stored.sessionId });
    } catch {
      setError("Could not end sharing. Reconnect and try again.");
    } finally {
      setWorking(false);
    }
  }
  return {
    sessionId: stored?.sessionId ?? null,
    session,
    code: stored?.code ?? null,
    status,
    proof,
    revision: session?.revision ?? null,
    connected,
    working,
    error,
    create,
    revoke,
    ready: isAuthenticated,
  };
}
export type PresentationBridge = ReturnType<typeof usePresentation>;

export function ProofTrail({ proof }: { proof: GraphProof }) {
  const steps = orderedProofEdges(proof);
  if (!steps.length) return null;
  return (
    <ol
      className="presentation-proof"
      data-testid="exact-proof"
      data-path-node-ids={JSON.stringify(proof.traversalNodeIds)}
      data-path-edge-keys={JSON.stringify(
        steps.map((step) => edgeKey(step.edge)),
      )}
    >
      {proof.traversalNodeIds.map((id, index) => (
        <li key={id} data-node-id={id}>
          <span>{proof.nodes.find((node) => node.id === id)?.label}</span>
          {steps[index] && (
            <small
              data-edge-id={steps[index].edge.id}
              data-source={steps[index].edge.source}
              data-target={steps[index].edge.target}
              data-kind={steps[index].edge.kind}
            >
              {steps[index].reverse ? "← " : ""}
              {steps[index].edge.kind}
              {steps[index].reverse ? "" : " →"}
            </small>
          )}
        </li>
      ))}
    </ol>
  );
}
export default function PresentationPanel({
  bridge,
  stage = false,
  animationComplete = false,
}: {
  bridge?: PresentationBridge;
  stage?: boolean;
  animationComplete?: boolean;
}) {
  const status = bridge?.status ?? "offline";
  const active = Boolean(
    bridge?.sessionId &&
    !["expired", "revoked", "unavailable"].includes(status),
  );
  const label =
    (
      {
        unpaired: "Your phone. A shared perspective.",
        waiting: "Ready for your phone",
        paired: "Phone connected",
        loading: "Finding the next path",
        live: "A path, shared live",
        error: "No live path available",
        expired: "Sharing session expired",
        revoked: "Sharing ended",
        disconnected: "Connection paused",
        connecting: "Connecting securely",
        unavailable: "Session unavailable",
        offline: "Connect to pair a phone",
      } as Record<string, string>
    )[status] ?? status;
  return (
    <section
      className={`presentation-panel ${stage ? "presentation-stage" : ""}`}
      aria-label="Phone presentation"
      data-testid="presentation-panel"
      data-status={status}
      data-revision={bridge?.revision ?? ""}
      data-animation-complete={animationComplete ? "true" : "false"}
    >
      <span className="eyebrow">
        <Smartphone size={13} /> PHONE → CONSTELLATION
      </span>
      <h3>{label}</h3>
      {status === "waiting" && bridge?.code && (
        <>
          <p>
            On your phone, open Orbit → Share to desktop. Enter this code, then
            approve the topics to share.
          </p>
          <output
            className="pairing-code"
            aria-label="Pairing code"
            data-testid="pairing-code"
          >
            {bridge.code}
          </output>
          <small className="presentation-caption">
            Single use · expires in 5 minutes
          </small>
        </>
      )}
      {status === "waiting" && !bridge?.code && (
        <p>
          This pairing code is unavailable. Create a new code to connect your
          phone.
        </p>
      )}
      {status === "live" && bridge?.proof && (
        <>
          <p>Only the phone’s approved public topic path appears here.</p>
          <ProofTrail proof={bridge.proof} />
        </>
      )}
      {status === "loading" && (
        <p className="presentation-loading">
          <LoaderCircle size={14} className="spin" /> Reading the graph for the
          phone’s latest choices.
        </p>
      )}
      {status === "paired" && (
        <p>
          The phone has approved its topic scope. Its next available graph path
          will appear here.
        </p>
      )}
      {status === "error" && (
        <p>
          The approved topics have no available path, or the graph could not be
          reached. Change the phone’s topics or retry there.
        </p>
      )}
      {["unpaired", "offline"].includes(status) && (
        <p>Pair a phone to present its approved topic paths as they change.</p>
      )}
      {status === "disconnected" && (
        <p>Live highlighting is hidden until the secure connection returns.</p>
      )}
      {["revoked", "expired", "unavailable"].includes(status) && (
        <p>No phone activity is being projected.</p>
      )}
      {bridge?.error && (
        <p className="presentation-error" role="alert">
          {bridge.error}
        </p>
      )}
      <div className="presentation-actions">
        {bridge && (!active || (status === "waiting" && !bridge.code)) && (
          <button
            className="dark-button"
            data-testid="pair-phone"
            disabled={bridge.working || !bridge.ready || !bridge.connected}
            onClick={() => void bridge.create()}
          >
            <Smartphone size={15} />
            {bridge.working ? "Connecting…" : "Pair phone"}
          </button>
        )}
        {bridge && active && (
          <button
            className="outlined-button"
            data-testid="revoke-presentation"
            disabled={bridge.working || !bridge.connected}
            onClick={() => void bridge.revoke()}
          >
            <X size={14} />
            End sharing
          </button>
        )}
      </div>
      <p className="presentation-privacy">
        <ShieldCheck size={13} />{" "}
        {stage
          ? "Public program paths only."
          : "Names, profiles, private plans and meetings stay off stage."}
      </p>
      {status === "live" && (
        <span className="presentation-revision" aria-live="polite">
          <Network size={12} /> Revision {bridge?.revision} ·{" "}
          {animationComplete ? "Path traced" : "Tracing returned path"}
        </span>
      )}
    </section>
  );
}
