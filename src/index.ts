import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";
import * as S from "fp-ts/lib/Semigroup";

import { missingParent, duplicateNodes } from "./errors";
import { Id, Dag, Builder, IdType, NodeAddition, BuilderInstruction } from "./types";
import { Eq } from "fp-ts/lib/Eq";

export { Dag };

export const empty = <T extends Id = never>(): Dag<T> => ({
  nodes: new Map(),
  edges: [],
});

const eqId: Eq<Id> = {
  equals: (x, y) => x.id === y.id,
};

export const builder = <T extends Id = Id>(startingDag?: Dag<T>): Builder<T> => ({
  startingDag: typeof startingDag === "undefined" ? empty<T>() : startingDag,
  instructions: [],
});

const createAddInstruction =
  <T extends Id>(node: T, parentIds: IdType[]): NodeAddition<T> =>
    ({
      node,
      parentIds,
    })

// TODO: Analyze if space is ok with this. It's wasteful, but probably ok for small
// graphs.
export const addNode = <T extends Id>(node: T, parentIds: IdType[]) => (builder: Builder<T>) =>
  ({
    instructions: [...builder.instructions, createAddInstruction(node, parentIds)],
    startingDag: builder.startingDag,
  });

type BuildError = string; // TODO: Do something nicer here?

interface FailedInstruction<T extends Id> {
  instr: BuilderInstruction<T>;
  err: BuildError;
}
const failedInstruction = <T extends Id>(instr: BuilderInstruction<T>, err: BuildError) => ({
  instr, err
});

export const build =
  <T extends Id>() =>
    (builder: Builder<T>): E.Either<BuildError, Dag<T>> =>
      buildStep(
        builder.startingDag,
        builder.instructions,
        [],
      );

const containsId = <T extends Id>(id: IdType) => (dag: Dag<T>): boolean =>
  dag.nodes.has(id);

export const getHeight = <T extends Id>(nodeId: IdType) => (dag: Dag<T>): O.Option<number> => {
  return pipe(
    dag.nodes.get(nodeId),
    O.fromNullable,
    O.map(nodeInfo => nodeInfo.height),
  );
}

const semigroupMax: S.Semigroup<number> = {
  concat: (x, y) => Math.max(x, y)
}
const optionMax = O.getApplySemigroup(semigroupMax).concat;

const attemptInstruction =
  <T extends Id>(todo: BuilderInstruction<T>) =>
    (dag: Dag<T>): E.Either<BuildError, Dag<T>> => {
      const nodeAlreadyInGraph = containsId(todo.node.id)(dag);
      if (nodeAlreadyInGraph) {
        return E.left(duplicateNodes(todo.node.id));
      }
      const nodeHeight: O.Option<number> =
        todo.parentIds.reduce((maxHeightSoFar, parentId) => {
          const minHeight = pipe(dag, getHeight(parentId), O.map(height => height + 1));
          return optionMax(maxHeightSoFar, minHeight)
        }, O.some(0));

      return pipe(
        nodeHeight,
        O.fold(
          () => E.left(missingParent(todo.node.id)),
          (height) => {
            const newEdges = todo.parentIds.map(parentId => ({
              from: parentId,
              to: todo.node.id,
            }));
            // TODO: We should be less wasteful here and use a structure that
            // reuses old bits as possible.
            const newMap = new Map(dag.nodes);
            newMap.set(todo.node.id, { node: todo.node, height });
            const newDag: Dag<T> = {
              edges: [...dag.edges, ...newEdges],
              nodes: newMap,
            }
            return E.right(newDag);
          }
        )
      );
    }

export const buildStep = <T extends Id>(dag: Dag<T>, pending: BuilderInstruction<T>[], failed: FailedInstruction<T>[]): E.Either<BuildError, Dag<T>> =>
  pipe(
    pending,
    A.foldLeft(
      () =>
        A.isEmpty(failed)
          ? E.right(dag)
          : E.left(failed.map(fi => fi.err).join("; ")),
      (head, tail) => pipe(
        dag,
        attemptInstruction(head),
        E.fold(
          err => buildStep(dag, tail, [...failed, failedInstruction(head, err)]),
          nextDag => buildStep(nextDag, [...failed.map(fi => fi.instr), ...tail], []),
        )
      )
    )
  );

export const contains = <T extends Id>(queryNode: T) => (dag: Dag<T>): boolean =>
  dag.nodes.has(queryNode.id);

export const get = <T extends Id>(queryId: IdType) => (dag: Dag<T>): O.Option<T> =>
  pipe(
    dag.nodes.get(queryId),
    O.fromNullable,
    O.map(nodeInfo => nodeInfo.node),
  );


export const getChildren = <T extends Id>(queryNode: T) => (dag: Dag<T>): T[] =>
  pipe(
    dag.edges,
    A.filterMap(edge => {
      // We want to map all the edges from the queryNode
      if (edge.from === queryNode.id) {
        // ... to the actual node of the children
        return pipe(
          dag,
          get<T>(edge.to),
        );
      } else {
        return O.none;
      }
    }),
  );

export const getParents = <T extends Id>(queryNode: T) => (dag: Dag<T>): T[] =>
  pipe(
    dag.edges,
    A.filterMap(edge => {
      // We want to map all the edges to the queryNode
      if (edge.to === queryNode.id) {
        // ... to the actual node of the parent
        return pipe(
          dag,
          get<T>(edge.from),
        );
      } else {
        return O.none;
      }
    }),
  );

export const isDescendantOf = <T extends Id>(target: T, ancestors: T[]) => (dag: Dag<T>): boolean => {
  return pipe(
    getParents(target)(dag),
    A.findFirst((parent) => A.elem(eqId)(parent, ancestors) || isDescendantOf(parent, ancestors)(dag)),
    O.isSome,
  );
}

export const size = <T extends Id>(dag: Dag<T>): number =>
  dag.nodes.size;
