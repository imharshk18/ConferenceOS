import { withGraph } from "./graph";
import { networkSnapshot, verifyNetworkGraph, NETWORK_EDGES, type NetworkInput, type NetworkGraph } from "./network";
/** Only opaque IDs and kinds are stored in FalkorDB. Private text stays in Convex. */
export async function calculateNetworkGraph(input: NetworkInput): Promise<NetworkGraph> {
  const snapshot = networkSnapshot(input);
  return withGraph(async graph => {
    await graph.query("UNWIND $rows AS row MERGE (n:CONetworkRecord {scope:$scope,key:row.key}) SET n.kind=row.kind", { params: { scope: input.scope, rows: snapshot.nodes.map(n => ({ key: n.id, kind: n.kind })) } });
    for (const kind of NETWORK_EDGES) {
      const rows = snapshot.edges.filter(e => e.kind === kind).map(e => ({ source: e.source, target: e.target }));
      if (rows.length) await graph.query(`UNWIND $rows AS row MATCH (a:CONetworkRecord {scope:$scope,key:row.source}),(b:CONetworkRecord {scope:$scope,key:row.target}) MERGE (a)-[:${kind}]->(b)`, { params: { scope: input.scope, rows } });
    }
    const nodes = await graph.roQuery("MATCH (n:CONetworkRecord {scope:$scope}) RETURN n.key AS key,n.kind AS kind", { params: { scope: input.scope } });
    const edges = await graph.roQuery("MATCH (a:CONetworkRecord {scope:$scope})-[r]->(b:CONetworkRecord {scope:$scope}) RETURN id(r) AS id,a.key AS source,b.key AS target,type(r) AS kind", { params: { scope: input.scope } });
    const result: NetworkGraph = { nodes: (nodes.data ?? []).map((n: any) => ({ ...snapshot.nodes.find(s => s.id === n.key)!, id: n.key, kind: n.kind })), edges: (edges.data ?? []).map((e: any) => ({ id: `falkor:${e.id}`, source: e.source, target: e.target, kind: e.kind })) };
    const verified = verifyNetworkGraph(input, result);
    if (!verified) throw new Error("Graph topology could not be verified");
    return verified;
  });
}
export async function deleteNetworkSnapshot(scope: string) {
  if (!/^[0-9a-f-]{36}$/i.test(scope)) throw new Error("Invalid graph scope");
  await withGraph(async graph => { await graph.query("MATCH (n:CONetworkRecord {scope:$scope}) DETACH DELETE n", { params: { scope } }); });
}
