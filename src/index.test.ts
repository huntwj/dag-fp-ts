import * as E from "fp-ts/lib/Either";
import { some } from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";

import { addNode, build, empty, Dag, emptyBuilder, getHeight } from ".";
import { missingParent, duplicateNodes } from "./errors";

const node = (id: string) => ({ id });

describe("Directed Acyclic Graph", () => {
  describe("empty()", () => {
    it("returns an empty graph", () => {
      const e: Dag = empty();

      expect(e.edges.length).toBe(0);
      expect(e.nodes.length).toBe(0);
    });
  })

  describe("builder() -> ... -> build()", () => {
    describe("addNode(node, parents)", () => {
      it("can add a root node to an empty graph", () => {
        pipe(
          emptyBuilder(),
          addNode(node("12"), []),
          build(),
          E.fold(err => {
            fail(`Builder returned an error: ${err}`);
          }, dag => {
            expect(dag.nodes.length).toBe(1);
            expect(dag.edges.length).toBe(0);
            expect(getHeight("12")(dag)).toEqual(some(0));
          })
        );
      });

      it("fails when adding a node without parents already in graph", () => {
        pipe(
          emptyBuilder(),
          addNode(node("10"), ["12"]),
          build(),
          E.fold(err => {
            expect(err).toBe(missingParent("10"));
          },
            dag => {
              console.log("dag", JSON.stringify(dag));
              fail("Unexpectedly got a successful DAG build.");
            })
        )
      });

      it("fails when adding a duplicate node", () => {
        pipe(
          emptyBuilder(),
          addNode(node("12"), []),
          addNode(node("12"), []),
          build(),
          E.fold(err => {
            expect(err).toBe(duplicateNodes("12"));
          },
            dag => {
              console.log("dag", JSON.stringify(dag));
              fail("Unexpectedly got a successful DAG build.");
            })
        );
      });

      it("fails when adding a node with self as parent", () => {
        pipe(
          emptyBuilder(),
          addNode(node("12"), ["12"]),
          build(),
          E.fold(err => {
            expect(err).toBe(missingParent("12"));
          },
            dag => {
              console.log("dag", JSON.stringify(dag));
              fail("Unexpectedly got a successful DAG build.");
            })
        );
      });

      it("allows adding a node when parent is in graph", () => {
        pipe(
          emptyBuilder(),
          addNode(node("12"), []),
          addNode(node("10"), ["12"]),
          build(),
          E.fold(
            err => { fail(`Unexpected error building DAG: ${err}`); },
            dag => {
              expect(pipe(dag, getHeight("12"))).toEqual(some(0));
              expect(pipe(dag, getHeight("10"))).toEqual(some(1));
            }
          )
        )
      });

      it("correctly chooses larger height when node has multiple parents", () => {
        pipe(
          emptyBuilder(),
          addNode(node("12"), []),
          addNode(node("10"), ["12"]),
          addNode(node("9"), ["12", "10"]),
          build(),
          E.fold(
            err => { fail(`Unexpected error building DAG: ${err}`); },
            dag => {
              expect(pipe(dag, getHeight("12"))).toEqual(some(0));
              expect(pipe(dag, getHeight("10"))).toEqual(some(1));
              expect(pipe(dag, getHeight("9"))).toEqual(some(2));
            }
          )
        )
      });

      it("does not matter which parent order is given when node has multiple parents", () => {
        pipe(
          emptyBuilder(),
          addNode(node("12"), []),
          addNode(node("10"), ["12"]),
          addNode(node("9"), ["10", "12"]),
          build(),
          E.fold(
            err => { fail(`Unexpected error building DAG: ${err}`); },
            dag => {
              expect(pipe(dag, getHeight("12"))).toEqual(some(0));
              expect(pipe(dag, getHeight("10"))).toEqual(some(1));
              expect(pipe(dag, getHeight("9"))).toEqual(some(2));
            }
          )
        )
      });
    });

  });
});
