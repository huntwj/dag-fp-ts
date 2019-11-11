export type IdType = string;
export interface Id {
  id: IdType;
}

export type NodeInfo<T extends Id> = {
  node: T;
  height: number;
}

export type Edge = {
  from: IdType;
  to: IdType;
}

export type Dag<T extends Id> = {
  readonly nodes: NodeInfo<T>[];
  readonly edges: Edge[];
}

export interface NodeAddition<T extends Id> {
  node: T;
  parentIds: IdType[];
}
export type BuilderInstruction<T extends Id> = NodeAddition<T>;

export interface Builder<T extends Id> {
  startingDag: Dag<T>;
  instructions: BuilderInstruction<T>[];
}
