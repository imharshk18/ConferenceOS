import { topics } from "./data";
import { NETWORK_AREAS } from './network';
import type { GraphProof } from "./intelligence";
export const SOCIAL_TOPICS = [...topics.map(t=>({id:t.id,name:t.name})),...NETWORK_AREAS.filter(a=>!topics.some(t=>t.id===a.id)).map(a=>({id:a.id,name:a.label}))];

export type SocialInput = {
  scope: string;
  revision: number;
  me: { name: string; skillIds: string[] };
  connections: { id: string; name: string; color: string; headline: string }[];
  memories: {
    id: string;
    connectionId: string;
    summary: string;
    topicIds: string[];
    demo?: boolean;
  }[];
  posts: {
    id: string;
    connectionId: string;
    excerpt: string;
    topicIds: string[];
    provenance: "simulation" | "brightdata-demo" | "brightdata-public";
    sourceUrl: string | null;
    createdAt: number;
  }[];
};
export type FeedItem = {
  id: string;
  connectionId: string;
  memoryId: string;
  postId: string;
  name: string;
  color: string;
  headline: string;
  excerpt: string;
  summary: string;
  topicId: string;
  reason: string;
  draft: string;
  proof: GraphProof;
  provenance: "simulation" | "brightdata-demo" | "brightdata-public";
  sourceUrl: string | null;
  publishedAt?: number;
};
export type SocialSnapshot = {
  nodes: GraphProof["nodes"];
  edges: Omit<GraphProof["edges"][number], "id">[];
};
export const SOCIAL_CYPHER = `MATCH p=(me:COSMember)-[:HAS_SKILL]->(topic:COSInterest)<-[:DISCUSSED]-(memory:COSMemory)<-[:REMEMBERS]-(author:COSMember)-[publication]->(post:COSSignal)
WHERE me.scope=$scope AND me.key='me' AND topic.scope=$scope AND memory.scope=$scope AND author.scope=$scope AND post.scope=$scope
AND (me)-[:MET]->(author) AND (me)-[:REMEMBERS]->(memory) AND (post)-[:ABOUT]->(topic)
AND memory.connection=author.connection AND post.connection=author.connection
AND type(publication) IN ['WROTE','SHARED_SOURCE']
RETURN p, memory.key AS memoryKey, post.key AS postKey, topic.key AS topicKey, author.connection AS connectionId
ORDER BY post.createdAt DESC LIMIT 40`;

/** Text stays in private Convex documents. FalkorDB stores only opaque keys and relationships. */
export function socialSnapshot(input: SocialInput): SocialSnapshot {
  const nodes: GraphProof["nodes"] = [
    { id: "me", kind: "COSMember", label: input.me.name },
  ];
  const edges: SocialSnapshot["edges"] = [];
  const add = (source: string, kind: string, target: string) =>
    edges.push({ source, kind, target });
  for (const topic of SOCIAL_TOPICS)
    nodes.push({
      id: `topic:${topic.id}`,
      kind: "COSInterest",
      label: topic.name,
    });
  for (const skill of input.me.skillIds)
    if (SOCIAL_TOPICS.some((t) => t.id === skill))
      add("me", "HAS_SKILL", `topic:${skill}`);
  for (const peer of input.connections) {
    nodes.push({ id: `peer:${peer.id}`, kind: "COSMember", label: peer.name });
    add("me", "MET", `peer:${peer.id}`);
  }
  for (const memory of input.memories) {
    if (!input.connections.some((c) => c.id === memory.connectionId)) continue;
    nodes.push({
      id: `memory:${memory.id}`,
      kind: "COSMemory",
      label: memory.demo ? "Your demo conversation" : "Your shared conversation",
    });
    add("me", "REMEMBERS", `memory:${memory.id}`);
    add(`peer:${memory.connectionId}`, "REMEMBERS", `memory:${memory.id}`);
    for (const topic of memory.topicIds)
      add(`memory:${memory.id}`, "DISCUSSED", `topic:${topic}`);
  }
  for (const post of input.posts) {
    if (!input.connections.some((c) => c.id === post.connectionId)) continue;
    nodes.push({
      id: `post:${post.id}`,
      kind: "COSSignal",
      label:
        post.provenance === "simulation"
          ? "New demo post"
          : post.provenance === "brightdata-public" ? "Imported public post" : "Bright Data source replay",
    });
    add(
      `peer:${post.connectionId}`,
      post.provenance === "simulation" ? "WROTE" : "SHARED_SOURCE",
      `post:${post.id}`,
    );
    for (const topic of post.topicIds)
      add(`post:${post.id}`, "ABOUT", `topic:${topic}`);
  }
  return { nodes, edges };
}

/** Resolve actual FalkorDB edge IDs/direction; never manufacture a path from matching text. */
export function socialProof(
  path: any,
  snapshot: SocialSnapshot,
): GraphProof | null {
  if (
    !path ||
    !Array.isArray(path.nodes) ||
    path.nodes.length !== 5 ||
    !Array.isArray(path.edges) ||
    path.edges.length !== 4
  )
    return null;
  const ids = new Map<string, string>();
  const nodes: GraphProof["nodes"] = [];
  for (const node of path.nodes) {
    const expected = snapshot.nodes.find((n) => n.id === node.properties?.key);
    if (!expected || !node.labels?.includes(expected.kind)) return null;
    ids.set(String(node.id), expected.id);
    nodes.push(expected);
  }
  const edges: GraphProof["edges"] = [];
  for (const edge of path.edges) {
    const source = ids.get(
      String(edge.sourceId ?? edge.sourceNode?.id ?? edge.sourceNode),
    );
    const target = ids.get(
      String(
        edge.destinationId ?? edge.destinationNode?.id ?? edge.destinationNode,
      ),
    );
    if (
      !source ||
      !target ||
      edge.id === undefined ||
      !snapshot.edges.some(
        (e) =>
          e.source === source &&
          e.target === target &&
          e.kind === edge.relationshipType,
      )
    )
      return null;
    edges.push({
      id: `falkor:${edge.id}`,
      source,
      target,
      kind: edge.relationshipType,
    });
  }
  const proof = { nodes, edges, traversalNodeIds: nodes.map((n) => n.id) };
  return validSocialProof(proof, snapshot) ? proof : null;
}

export function validSocialProof(
  proof: GraphProof,
  snapshot: SocialSnapshot,
): boolean {
  if (
    proof.nodes.length !== 5 ||
    proof.edges.length !== 4 ||
    proof.traversalNodeIds.length !== 5 ||
    new Set(proof.traversalNodeIds).size !== 5 ||
    new Set(proof.edges.map((e) => e.id)).size !== 4
  )
    return false;
  if (
    !proof.nodes.every((n) =>
      snapshot.nodes.some(
        (s) => s.id === n.id && s.kind === n.kind && s.label === n.label,
      ),
    )
  )
    return false;
  if (
    !proof.edges.every(
      (e) =>
        /^falkor:\d+$/.test(e.id) &&
        snapshot.edges.some(
          (s) =>
            s.source === e.source && s.target === e.target && s.kind === e.kind,
        ),
    )
  )
    return false;
  return (
    proof.traversalNodeIds.every((id) =>
      proof.nodes.some((n) => n.id === id),
    ) &&
    proof.traversalNodeIds
      .slice(1)
      .every((to, i) =>
        proof.edges.some(
          (e) =>
            (e.source === to && e.target === proof.traversalNodeIds[i]) ||
            (e.target === to && e.source === proof.traversalNodeIds[i]),
        ),
      )
  );
}

/** Recheck all consent-derived inputs at commit time, including the graph's relationship constraints. */
export function feedItem(
  input: SocialInput,
  proof: GraphProof,
  postId: string,
  memoryId: string,
): FeedItem | null {
  if (!validSocialProof(proof, socialSnapshot(input))) return null;
  const post = input.posts.find((p) => p.id === postId),
    memory = input.memories.find((m) => m.id === memoryId);
  if (!post || !memory || post.connectionId !== memory.connectionId)
    return null;
  const peer = input.connections.find((c) => c.id === post.connectionId);
  const topicId = proof.traversalNodeIds[1]?.replace(/^topic:/, "");
  const topic = SOCIAL_TOPICS.find((t) => t.id === topicId);
  if (
    !peer ||
    !topic ||
    !input.me.skillIds.includes(topicId) ||
    !memory.topicIds.includes(topicId) ||
    !post.topicIds.includes(topicId)
  )
    return null;
  const expected = [
    "me",
    `topic:${topicId}`,
    `memory:${memory.id}`,
    `peer:${peer.id}`,
    `post:${post.id}`,
  ];
  if (expected.some((id, i) => proof.traversalNodeIds[i] !== id)) return null;
  return {
    id: `${post.id}:${memory.id}`,
    connectionId: peer.id,
    memoryId,
    postId,
    name: peer.name,
    color: peer.color,
    headline: peer.headline,
    excerpt: post.excerpt,
    summary: memory.summary,
    topicId,
    proof,
    provenance: post.provenance,
    sourceUrl: post.sourceUrl,
    publishedAt: post.createdAt,
    reason: `${post.provenance === "brightdata-public" ? `A public post from the source you associated with ${peer.name}` : `${peer.name}'s ${post.provenance === "simulation" ? "demo post" : "source replay"}`} overlaps with your ${topic.name} context and ${memory.demo?'a saved demo conversation (simulated connection)':'a conversation you both approved'}.`,
    draft: `Hey ${peer.name.split(" ")[0]}, your ${post.provenance === "simulation" ? "post" : "shared opportunity"} reminded me of our conversation at Universe about ${topic.name.toLowerCase()}. I'd love to compare notes and see if I can help. Would you be up for a quick catch-up?`,
  };
}

/** A one-event projection. No user IDs, source IDs, names, interests, post text or memory text. */
export function redactSocialProof(proof: GraphProof): GraphProof {
  const aliases = new Map(
    proof.traversalNodeIds.map((id, i) => [id, `shared:n${i}`]),
  );
  const labels: Record<string, [string, string]> = {
    COSMember: ["SharedPerson", "A connection"],
    COSInterest: ["SharedTopic", "Shared topic"],
    COSMemory: ["SharedMemory", "Approved memory"],
    COSSignal: ["SharedSignal", "New opportunity"],
  };
  return {
    nodes: proof.nodes.map((n) => ({
      id: aliases.get(n.id)!,
      kind: labels[n.kind][0],
      label: n.id === "me" ? "You" : labels[n.kind][1],
    })),
    edges: proof.edges.map((e, i) => ({
      id: `shared:e${i}`,
      source: aliases.get(e.source)!,
      target: aliases.get(e.target)!,
      kind: e.kind,
    })),
    traversalNodeIds: proof.traversalNodeIds.map((id) => aliases.get(id)!),
  };
}
export function isRedactedSocialProof(proof: GraphProof): boolean {
  if (
    proof.nodes.length !== 5 ||
    proof.edges.length !== 4 ||
    proof.traversalNodeIds.join(",") !==
      "shared:n0,shared:n1,shared:n2,shared:n3,shared:n4"
  )
    return false;
  const expected = [
    ["SharedPerson", "You"],
    ["SharedTopic", "Shared topic"],
    ["SharedMemory", "Approved memory"],
    ["SharedPerson", "A connection"],
    ["SharedSignal", "New opportunity"],
  ];
  if (
    !expected.every(([kind, label], i) =>
      proof.nodes.some(
        (n) => n.id === `shared:n${i}` && n.kind === kind && n.label === label,
      ),
    )
  )
    return false;
  const publication = proof.edges.find(
    (e) => e.source === "shared:n3" && e.target === "shared:n4",
  );
  if (!publication || !["WROTE", "SHARED_SOURCE"].includes(publication.kind))
    return false;
  const expectedEdges = [
    ["shared:n0", "HAS_SKILL", "shared:n1"],
    ["shared:n2", "DISCUSSED", "shared:n1"],
    ["shared:n3", "REMEMBERS", "shared:n2"],
    ["shared:n3", publication.kind, "shared:n4"],
  ];
  return expectedEdges.every(([source, kind, target]) =>
    proof.edges.some(
      (e) =>
        /^shared:e[0-3]$/.test(e.id) &&
        e.source === source &&
        e.kind === kind &&
        e.target === target,
    ),
  );
}
