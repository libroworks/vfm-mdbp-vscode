const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");

// Cached SVGs contain document/position-specific IDs, including marker references.
const cache = new Map();

async function createRenderer() {
  const { renderMermaid } = await import("@mermaid-js/mermaid-cli");
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true });
  return {
    async render(definition, id) {
      const result = await renderMermaid(browser, definition, "svg", {
        svgId: id,
        backgroundColor: "transparent",
        mermaidConfig: { securityLevel: "strict", htmlLabels: false },
      });
      return Buffer.from(result.data).toString("utf8");
    },
    close: () => browser.close(),
  };
}

function mermaidPlugin(rendererFactory = createRenderer) {
  return async function (tree, file) {
    const diagrams = [];
    function visit(node) {
      if (node.type === "code" && node.lang?.toLowerCase() === "mermaid") diagrams.push(node);
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
    let renderer;
    try {
      for (const [index, node] of diagrams.entries()) {
        const key = crypto.createHash("sha256")
          .update(JSON.stringify([file.path, index, node.value])).digest("hex");
        try {
          let svg = cache.get(key);
          if (!svg) {
            renderer ||= await rendererFactory();
            svg = await renderer.render(node.value, `mdbp-mermaid-${key}`);
            if (!svg.includes("<svg")) throw new Error("SVGが生成されませんでした");
            if (cache.size >= 128) cache.delete(cache.keys().next().value);
            cache.set(key, svg);
          }
          node.type = "html";
          node.value = `<div class="mdbp-mermaid">${svg}</div>`;
        } catch (error) {
          file.message(`MermaidのSVG変換に失敗しました: ${error.message}`, node.position);
        }
      }
    } finally {
      if (renderer) await renderer.close();
    }
  };
}

module.exports = { mermaidPlugin };
