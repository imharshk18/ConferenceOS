import { withGraph } from "./graph";
import {
  socialSnapshot,
  socialProof,
  feedItem,
  SOCIAL_CYPHER,
  type SocialInput,
  type FeedItem,
} from "./social";

export async function calculateSocialGraph(
  input: SocialInput,
): Promise<FeedItem[]> {
  const snapshot = socialSnapshot(input);
  return withGraph(async (graph) => {
    for (const kind of ["COSMember", "COSInterest", "COSMemory", "COSSignal"]) {
      const rows = snapshot.nodes
        .filter((n) => n.kind === kind)
        .map((n) => ({
          key: n.id,
          connection: n.id.startsWith("peer:")
            ? n.id.slice(5)
            : n.id.startsWith("memory:")
              ? input.memories.find((m) => `memory:${m.id}` === n.id)!
                  .connectionId
              : n.id.startsWith("post:")
                ? input.posts.find((p) => `post:${p.id}` === n.id)!.connectionId
                : "",
          createdAt: n.id.startsWith("post:")
            ? input.posts.find((p) => `post:${p.id}` === n.id)!.createdAt
            : 0,
        }));
      if (rows.length)
        await graph.query(
          `UNWIND $rows AS row MERGE (n:COSRecord:${kind} {scope:$scope,key:row.key}) SET n.connection=row.connection,n.createdAt=row.createdAt`,
          { params: { scope: input.scope, rows } },
        );
    }
    for (const kind of [
      "HAS_SKILL",
      "MET",
      "REMEMBERS",
      "DISCUSSED",
      "WROTE",
      "SHARED_SOURCE",
      "ABOUT",
    ]) {
      const rows = snapshot.edges
        .filter((e) => e.kind === kind)
        .map((e) => ({ source: e.source, target: e.target }));
      if (rows.length)
        await graph.query(
          `UNWIND $rows AS row MATCH (a:COSRecord {scope:$scope,key:row.source}),(b:COSRecord {scope:$scope,key:row.target}) MERGE (a)-[:${kind}]->(b)`,
          { params: { scope: input.scope, rows } },
        );
    }
    const result = await graph.roQuery(SOCIAL_CYPHER, {
      params: { scope: input.scope },
    });
    const items: FeedItem[] = [];
    const seen = new Set<string>();
    for (const row of (result.data ?? []) as any[]) {
      const proof = socialProof(row.p, snapshot);
      if (!proof) continue;
      const item = feedItem(
        input,
        proof,
        String(row.postKey).replace(/^post:/, ""),
        String(row.memoryKey).replace(/^memory:/, ""),
      );
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
    return items;
  });
}

/** Only remove the superseded, opaque job scope. Public conference data is never targeted. */
export async function deleteSocialSnapshot(scope: string) {
  if (!/^[0-9a-f-]{36}$/i.test(scope)) throw new Error("Invalid graph scope");
  await withGraph(async (graph) => {
    await graph.query("MATCH (n:COSRecord {scope:$scope}) DETACH DELETE n", {
      params: { scope },
    });
  });
}
