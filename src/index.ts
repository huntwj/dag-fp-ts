import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";
import * as S from "fp-ts/lib/Semigroup";

import { missingParent, duplicateNodes } from "./errors";
import { Id, Dag, Builder, IdType, NodeAddition, BuilderInstruction } from "./types";

export { Dag };

export const empty = <T extends Id = Id>(): Dag<T> => ({
  nodes: [],
  edges: [],
});

export const emptyBuilder = <T extends Id = Id>(): Builder<T> => ({
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
    instructions: [...builder.instructions, createAddInstruction(node, parentIds)]
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
  <T extends Id>(startDag?: Dag<T>) =>
    (builder: Builder<T>): E.Either<BuildError, Dag> =>
      buildStep(
        typeof startDag === "undefined" ? empty() : startDag,
        builder.instructions,
        [],
      );

// TODO: This is pretty inefficient for large lists. Come back to this.
const containsId = <T extends Id>(id: IdType) => (dag: Dag<T>): boolean =>
  dag.nodes.some((nodeInfo) => nodeInfo.node.id === id);

export const getHeight = <T extends Id>(nodeId: IdType) => (dag: Dag<T>): O.Option<number> => {
  return pipe(
    dag.nodes.find((nodeInfo) => nodeInfo.node.id === nodeId),
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
            const newDag: Dag<T> = {
              edges: [...dag.edges, ...newEdges],
              nodes: [...dag.nodes, { node: todo.node, height }],
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
