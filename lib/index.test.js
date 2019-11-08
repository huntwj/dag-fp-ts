"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = require(".");
describe("Directed Acyclic Graph", () => {
    describe("empty()", () => {
        it("returns an empty graph", () => {
            const e = _1.empty();
            expect(e.edges.length).toBe(0);
            expect(e.nodes.length).toBe(0);
        });
    });
});
//# sourceMappingURL=index.test.js.map