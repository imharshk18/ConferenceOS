import type { Doc } from './_generated/dataModel';
/** Synthetic peers cannot consent. Their owner-reviewed demo notes are labeled simulations. */
export function usableMemory(memory: Doc<'memories'>, connection: Doc<'connections'>) {
  return memory.status === 'shared' && (connection.demo === true
    ? memory.createdBy === connection.requestorId && (memory.autoSaved === true || memory.approvedBy.includes(connection.requestorId))
    : memory.approvedBy.includes(connection.requestorId) && memory.approvedBy.includes(connection.recipientId));
}
