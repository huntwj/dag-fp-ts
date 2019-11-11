import * as E from "fp-ts/lib/Either";
import { some } from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";

import { addNode, build, builder, empty, Dag, getHeight } from ".";
import { missingParent, duplicateNodes } from "./errors";

// a test node type that passes some extra data with the id.
interface Privilege {
  id: string;
  label: string;
}
const node = (id: string) =>
  ({ id });

const privNode = (id: string, label?: string) =>
  typeof label === "undefined"
    ? ({ id, label: id })
    : ({ id, label });

const adminNode = privNode("Admin");
const editAllNode = privNode("Edit All Nodes", "Nodes:Edit:All");
const editOwnNode = privNode("Edit Own Nodes", "Nodes:Edit:Own");
const viewAllNode = privNode("View All Nodes", "Nodes:View:All");
const viewOwnNode = privNode("View Own Nodes", "Ndoes:View:Own");

const addAdmin = addNode(adminNode, []);
const addEditAll = addNode(editAllNode, [adminNode.id]);
const addEditOwn = addNode(editOwnNode, [editAllNode.id]);
const addViewAll = addNode(viewAllNode, [editAllNode.id]);
const addViewOwn = addNode(viewOwnNode, [viewAllNode.id, editOwnNode.id]);

describe("Directed Acyclic Graph", () => {
  describe("empty()", () => {
    it("returns an empty graph", () => {
      const e = empty();

      expect(e.edges.length).toBe(0);
      expect(e.nodes.length).toBe(0);
    });
  })

  describe("builder() -> ... -> build()", () => {
    describe("addNode(node, parents)", () => {
      describe("using simple nodes", () => {
        it("can add a root node to an empty graph", () => {
          pipe(
            builder(),
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
            builder(),
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
            builder(),
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
            builder(),
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
            builder(),
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
            builder(),
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
            builder(),
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

      describe("using nodes with meta data", () => {
        it("allows nodes to be given to the builder in any order as long as they make a proper dag in the end", () => {
          pipe(
            builder<Privilege>(),
            addAdmin,
            addEditOwn,
            addEditAll,
            addViewAll,
            addViewOwn,
            build(),
            E.fold(
              err => {
                fail(`Unexpected build failure: ${JSON.stringify(err)}`)
              },
              dag => {
                expect(dag.nodes.length).toBe(5);
              }
            )
          )
        });

        it("allows you to add nodes to existing DAG", () => {
          pipe(
            builder<Privilege>(),
            addAdmin,
            addEditOwn,
            addEditAll,
            build<Privilege>(),
            E.fold(
              err => {
                fail(`Unexpected build failure: ${JSON.stringify(err)}`)
              },
              editOnlyDag => {
                pipe(
                  builder<Privilege>(editOnlyDag),
                  addViewOwn,
                  addViewAll,
                  build(),
                  E.fold(
                    err => {
                      fail(`Unexpected build failure: ${JSON.stringify(err)}`)
                    },
                    dag => {
                      expect(dag.nodes.length).toBe(5);
                    }
                  ),
                );
              }
            )
          );
        });
      });
    });

  });
});
