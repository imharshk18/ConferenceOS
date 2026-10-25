/** A descriptive network-context index, never an assessment of a person's ability. */
export const NETWORK_AREAS = [
  { id: "ai", label: "AI & agents", color: "#bda4ff" },
  { id: "content", label: "Content & storytelling", color: "#ffb4d5" },
  { id: "design", label: "Design & creativity", color: "#f6bf87" },
  { id: "product", label: "Product", color: "#adceff" },
  { id: "founders", label: "Founders & startups", color: "#e2ed9b" },
  { id: "growth", label: "Community & growth", color: "#8ce9c1" },
  { id: "research", label: "Research", color: "#d8b5ed" },
  { id: "opensource", label: "Open source", color: "#91dfd7" },
  { id: "platform", label: "Cloud & platforms", color: "#a8b9ef" },
  { id: "security", label: "Security", color: "#efb0aa" },
  { id: "graph", label: "Graphs & data", color: "#99e9ed" },
  { id: "devex", label: "Developer experience", color: "#dbd59c" },
] as const;
export const NETWORK_KINDS = ["self", "person", "area", "memory", "session", "goal"] as const;
export const NETWORK_EDGES = ["MET", "DECLARES", "REMEMBERS", "ABOUT", "EXPLORED", "AIMS_FOR"] as const;
export type NetworkNode = { id: string; kind: typeof NETWORK_KINDS[number]; label: string; detail: string; areaIds: string[]; color: string; evidence: "accepted-connection" | "self-declared" | "mutually-approved" | "reviewed-learning" | "reviewed-goal" | "demo-simulation" };
export type NetworkEdge = { id: string; source: string; target: string; kind: string };
export type NetworkGraph = { nodes: NetworkNode[]; edges: NetworkEdge[] };
export type NetworkInput = {
  scope: string; revision: number; me: { name: string; areaIds: string[] };
  connections: { id: string; name: string; headline: string; color: string; areaIds: string[]; acceptedAt: number; demo?: boolean }[];
  memories: { id: string; connectionId: string; summary: string; areaIds: string[]; demo?: boolean; autoSaved?: boolean }[];
  captures: { id: string; kind: "session" | "goal"; title: string; summary: string; areaIds: string[]; attended: boolean; talkId?: string }[];
};
export function validNetworkAreas(ids: string[]) {
  if (ids.length > NETWORK_AREAS.length || ids.some(id => !NETWORK_AREAS.some(a => a.id === id))) throw new Error("Choose the available network areas");
  return [...new Set(ids)];
}
export const networkEdgeKey = (e: Pick<NetworkEdge, "source" | "target" | "kind">) => `${e.source}|${e.kind}|${e.target}`;
export function networkSnapshot(input: NetworkInput) {
  const nodes: NetworkNode[] = [{ id: "me", kind: "self", label: input.me.name, detail: "Your private, accepted connections and reviewed context.", areaIds: input.me.areaIds, color: "#ffffff", evidence: "self-declared" }];
  const edges: Omit<NetworkEdge, "id">[] = [], used = new Set<string>();
  const add = (source: string, kind: string, target: string) => edges.push({ source, target, kind });
  const areas = (id: string, kind: string, areaIds: string[]) => {
    for (const area of validNetworkAreas(areaIds)) { used.add(area); add(id, kind, `area:${area}`); }
  };
  areas("me", "DECLARES", input.me.areaIds);
  for (const person of input.connections) {
    const id = `person:${person.id}`;
    nodes.push({ id, kind: "person", label: person.name, detail: person.headline || "An accepted ConferenceOS connection. Areas come from their profile or a conversation you both reviewed.", areaIds: person.areaIds, color: person.color, evidence: person.demo ? "demo-simulation" : "accepted-connection" });
    add("me", "MET", id); areas(id, "DECLARES", person.areaIds);
  }
  for (const memory of input.memories) {
    if (!input.connections.some(c => c.id === memory.connectionId)) continue;
    const id = `memory:${memory.id}`;
    nodes.push({ id, kind: "memory", label: memory.autoSaved ? "Auto-saved demo context" : memory.demo ? "Demo conversation" : "Shared conversation", detail: memory.summary, areaIds: memory.areaIds, color: "#ffb9d9", evidence: memory.demo ? "demo-simulation" : "mutually-approved" });
    add("me", "REMEMBERS", id); add(`person:${memory.connectionId}`, "REMEMBERS", id); areas(id, "ABOUT", memory.areaIds);
  }
  for (const capture of input.captures) {
    const id = `${capture.kind}:${capture.id}`;
    nodes.push({ id, kind: capture.kind, label: capture.title, detail: capture.summary, areaIds: capture.areaIds, color: capture.kind === "session" ? "#95e9d7" : "#b9c8f7", evidence: capture.kind === "session" ? "reviewed-learning" : "reviewed-goal" });
    add("me", capture.kind === "session" ? "EXPLORED" : "AIMS_FOR", id); areas(id, "ABOUT", capture.areaIds);
  }
  for (const area of NETWORK_AREAS) if (used.has(area.id)) nodes.push({ id: `area:${area.id}`, kind: "area", label: area.label, detail: "A context area linked by explicitly declared profiles or approved notes. This is network coverage, not proof of personal expertise.", areaIds: [area.id], color: area.color, evidence: "self-declared" });
  return { nodes, edges };
}
export function networkStats(input: NetworkInput, now: number) {
  const areas = NETWORK_AREAS.map(area => {
    const memories = input.memories.filter(m => m.areaIds.includes(area.id));
    const connected = new Set([...input.connections.filter(p => p.areaIds.includes(area.id)).map(p => p.id), ...memories.map(m => m.connectionId)]);
    const connections = connected.size, memoryCount = memories.length;
    return { ...area, connections, memoryCount, learningCount: input.captures.filter(c => c.kind === "session" && c.areaIds.includes(area.id)).length, score: Math.min(100, 15 * connections + 10 * memoryCount) };
  });
  return { connections: input.connections.length, sharedMemories: input.memories.length,
    demoConnections: input.connections.filter(c=>c.demo).length, demoMemories: input.memories.filter(m=>m.demo).length,
    sessionsAttended: new Set(input.captures.filter(c => c.kind === "session" && c.attended).map(c => c.talkId ?? c.id)).size,
    learningCaptures: input.captures.filter(c => c.kind === "session").length, goalsReviewed: input.captures.filter(c => c.kind === "goal").length,
    contextLinks: networkSnapshot(input).edges.length, recentConnections: input.connections.filter(c => c.acceptedAt >= now - 7 * 86_400_000).length,
    areas, topAreas: [...areas].filter(a => a.score > 0).sort((a, b) => b.score - a.score || b.connections - a.connections || a.id.localeCompare(b.id)).slice(0, 3).map(a => a.id) };
}
export type NetworkStats = ReturnType<typeof networkStats>;
/** Reconstruct metadata only after exact node/relationship topology was read back from FalkorDB. */
export function verifyNetworkGraph(input: NetworkInput, graph: NetworkGraph): NetworkGraph | null {
  const snapshot = networkSnapshot(input);
  if (graph.nodes.length !== snapshot.nodes.length || graph.edges.length !== snapshot.edges.length) return null;
  if (new Set(graph.nodes.map(n => n.id)).size !== graph.nodes.length || new Set(graph.edges.map(e => e.id)).size !== graph.edges.length) return null;
  if (graph.nodes.some(n => !snapshot.nodes.some(s => s.id === n.id && s.kind === n.kind))) return null;
  const expected = new Set(snapshot.edges.map(networkEdgeKey));
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const key = networkEdgeKey(edge);
    if (!/^falkor:\d+$/.test(edge.id) || !expected.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  return { nodes: snapshot.nodes, edges: graph.edges };
}
export type SharedContextGraph = { nodes: { id: string; kind: string; label: string }[]; edges: NetworkEdge[] };
const REDACTED: Record<NetworkNode["kind"], { kind: string; label: string }> = {
  self: { kind: "SharedSelf", label: "You" }, person: { kind: "SharedPerson", label: "A connection" }, area: { kind: "SharedTopic", label: "A context area" },
  memory: { kind: "SharedMemory", label: "An approved conversation" }, session: { kind: "SharedLearning", label: "A reviewed learning moment" }, goal: { kind: "SharedGoal", label: "A reviewed goal" },
};
export async function redactNetworkGraph(graph: NetworkGraph, salt: string): Promise<SharedContextGraph> {
  const alias = async (key: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${key}`));
    return "context:" + Array.from(new Uint8Array(digest)).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
  };
  const ids = new Map(await Promise.all(graph.nodes.map(async n => [n.id, await alias(n.id)] as const)));
  return { nodes: graph.nodes.map(n => ({ id: ids.get(n.id)!, ...REDACTED[n.kind], ...(n.evidence==='demo-simulation'?{label:n.kind==='person'?'A simulated connection':'A demo conversation'}:{}) })),
    edges: await Promise.all(graph.edges.map(async e => ({ id: await alias(networkEdgeKey(e)), source: ids.get(e.source)!, target: ids.get(e.target)!, kind: e.kind }))) };
}
export function validSharedContextGraph(graph: SharedContextGraph) {
  if (graph.nodes.length > 600 || graph.edges.length > 8000 || new Set(graph.nodes.map(n => n.id)).size !== graph.nodes.length || new Set(graph.edges.map(e => e.id)).size !== graph.edges.length) return false;
  const ids = new Set(graph.nodes.map(n => n.id));
  const alias = (id: string) => /^context:[a-f0-9]{24}$/.test(id);
  return graph.nodes.every(n => alias(n.id) && [...Object.values(REDACTED),{kind:'SharedPerson',label:'A simulated connection'},{kind:'SharedMemory',label:'A demo conversation'}].some(r => n.kind === r.kind && n.label === r.label)) && graph.edges.every(e => alias(e.id) && ids.has(e.source) && ids.has(e.target) && (NETWORK_EDGES as readonly string[]).includes(e.kind));
}
