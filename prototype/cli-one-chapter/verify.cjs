const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const source = path.resolve(__dirname, "../../exampleFiles");
  const { default: config } = await import("./vivliostyle.config.js");
  const { readMetadata } = await import("@vivliostyle/cli");
  const markdown = fs.readFileSync(path.join(source, "formattest.md"), "utf8");
  const result = await config.documentProcessor({}, readMetadata(markdown)).process({
    path: path.join(source, "formattest.md"), contents: markdown,
  });
  assert.equal(result.messages.length, 0, "Sample images must convert without diagnostics");
  const generated = fs.readFileSync(path.join(__dirname, "output/workspace/formattest.html"), "utf8");
  assert.equal(generated, String(result), "Actual CLI output must match processor output byte for byte");
  assert.match(generated, /<svg[^>]+viewBox=/);
  assert.match(generated, /class="codenum-elem"/);
  assert.match(generated, /id="h1_0"/);
  console.log(`PASS: processor and actual CLI HTML match (${Buffer.byteLength(generated)} bytes).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
