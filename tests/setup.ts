import { vi } from "vitest";
vi.mock("../packages/core/networkGraph", async () => {
  const { networkSnapshot } = await import("../packages/core/network");
  return { calculateNetworkGraph: vi.fn(async (input) => { const snapshot = networkSnapshot(input); return { ...snapshot, edges: snapshot.edges.map((e, i) => ({ ...e, id: `falkor:${i}` })) }; }), deleteNetworkSnapshot: vi.fn(async () => {}) };
});
