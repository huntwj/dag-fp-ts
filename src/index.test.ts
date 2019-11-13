import * as E from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";

import { addNode, build, builder, empty, Dag, getHeight, contains, get, getParents, size } from ".";
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
      expect(size(e)).toBe(0);
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
              expect(size(dag)).toBe(1);
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
                console.error("dag", JSON.stringify(dag));
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
                console.error("dag", JSON.stringify(dag));
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
                console.error("dag", JSON.stringify(dag));
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
                expect(size(dag)).toBe(5);
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
                      expect(size(dag)).toBe(5);
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

  describe("contains(T): boolean", () => {
    it("returns false for empty graphs", () => {
      const result = pipe(
        empty(),
        contains(node("10")),
      );

      expect(result).toBe(false);
    });

    it("returns false for non-empty graphs but node not in graph", () => {
      pipe(
        builder(),
        addNode(node("10"), []),
        addNode(node("12"), ["10"]),
        build(),
        E.fold(
          err => {
            fail(`Unexpected failure building valid graph: ${err}`);
          },
          dag => {
            const result = pipe(
              dag,
              contains(node("13")),
            )
            expect(result).toBe(false);
          }
        )
      )
    });

    it("returns true for node in graph", () => {
      pipe(
        builder(),
        addNode(node("10"), []),
        addNode(node("12"), ["10"]),
        build(),
        E.fold(
          err => {
            fail(`Unexpected failure building valid graph: ${err}`);
          },
          dag => {
            const result = pipe(
              dag,
              contains(node("10")),
            )
            expect(result).toBe(true);
          }
        )
      )
    });
  });

  describe("get(IdType): Option<T>", () => {
    it("returns `none` for empty graphs", () => {
      const result = pipe(
        empty(),
        get("10"),
      );

      expect(result).toEqual(none);
    });

    it("returns `none` for non-empty graphs but node not in graph", () => {
      pipe(
        builder(),
        addNode(node("10"), []),
        addNode(node("12"), ["10"]),
        build(),
        E.fold(
          err => {
            fail(`Unexpected failure building valid graph: ${err}`);
          },
          dag => {
            const result = pipe(
              dag,
              get("13"),
            )
            expect(result).toEqual(none);
          }
        )
      )
    });

    it("returns `some(node)` for node in graph", () => {
      const ten = node("10");
      pipe(
        builder(),
        addNode(ten, []),
        addNode(node("12"), ["10"]),
        build(),
        E.fold(
          err => {
            fail(`Unexpected failure building valid graph: ${err}`);
          },
          dag => {
            const result = pipe(
              dag,
              get("10"),
            )
            expect(result).toEqual(some(ten));
          }
        )
      )
    });

    describe("getParents(NodeType) => (Dag): Option<T>", () => {
      const ten = node("10");
      const twelve = node("12");

      it("returns `[]` for empty graphs", () => {
        const result = pipe(
          empty(),
          getParents(ten),
        );

        expect(result).toEqual([]);
      });

      it("returns `none` for non-empty graphs but node not in graph", () => {
        pipe(
          builder(),
          addNode(ten, []),
          addNode(twelve, ["10"]),
          build(),
          E.fold(
            err => {
              fail(`Unexpected failure building valid graph: ${err}`);
            },
            dag => {
              const result = pipe(
                dag,
                getParents(node("13")),
              )
              expect(result).toEqual([]);
            }
          )
        )
      });

      it("returns `[parents]` for node in graph", () => {
        pipe(
          builder(),
          addNode(ten, []),
          addNode(twelve, ["10"]),
          build(),
          E.fold(
            err => {
              fail(`Unexpected failure building valid graph: ${err}`);
            },
            dag => {
              const result = pipe(
                dag,
                getParents(twelve),
              )
              expect(result).toEqual([ten]);
            }
          )
        )
      });
    });
  });
});
