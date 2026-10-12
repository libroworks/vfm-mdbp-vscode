const assert = require("node:assert");
const { mermaidPlugin } = require("../../cli-runtime/mermaid-transformer.cjs");

suite("Mermaid transformer", () => {
  test("renders nested diagrams with unique IDs and reuses cached SVGs", async () => {
    const ids = [];
    let launches = 0;
    let closes = 0;
    const factory = async () => {
      launches++;
      return {
        render: async (text, id) => { ids.push(id); return `<svg id="${id}">${text}</svg>`; },
        close: async () => { closes++; },
      };
    };
    const tree = () => ({ type: "root", children: [{ type: "blockquote", children: [
      { type: "code", lang: "mermaid", value: "graph TD; A-->B" },
      { type: "code", lang: "mermaid", value: "graph TD; A-->B" },
      { type: "code", lang: "js", value: "keep" },
    ] }] });
    const file = { path: "cache-test.md", message: () => assert.fail("unexpected warning") };
    const first = tree();
    await mermaidPlugin(factory)(first, file);
    assert.equal(first.children[0].children[0].type, "html");
    assert.equal(first.children[0].children[2].type, "code");
    assert.notEqual(ids[0], ids[1]);
    await mermaidPlugin(factory)(tree(), file);
    assert.equal(launches, 1);
    assert.equal(closes, 1);
  });

  test("leaves failed diagrams as code, reports position, and closes browser", async () => {
    const position = { start: { line: 7, column: 1 } };
    const node = { type: "code", lang: "mermaid", value: "invalid", position };
    let closed = false;
    let warning;
    await mermaidPlugin(async () => ({
      render: async () => { throw new Error("parse error"); },
      close: async () => { closed = true; },
    }))({ children: [node] }, { path: "bad.md", message: (text, place) => { warning = { text, place }; } });
    assert.equal(node.type, "code");
    assert.match(warning.text, /parse error/);
    assert.equal(warning.place, position);
    assert.ok(closed);
  });

  test("does not launch a browser for ordinary code", async () => {
    await mermaidPlugin(() => assert.fail("unexpected browser"))({ children: [
      { type: "code", lang: "text", value: "mermaid" },
    ] }, {});
  });
});
