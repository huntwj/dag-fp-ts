import { IdType } from "./types"

export const missingParent = (nodeId: IdType) =>
  `Missing Parent: Cannot find one or more parents for node '${nodeId}'`

export const duplicateNodes = (nodeId: IdType) =>
  `Duplicate Nodes Not Allowed: node '${nodeId}' already in graph.`
