const assert = require("assert");
const path = require("path");
const { transformSvgImages } = require("../../lib/svgimg-transformer");

const imageDirectory = path.resolve(__dirname, "../../exampleFiles/img0");

suite("svgimg transformer", () => {
  test("converts an existing image and all supported parameters", () => {
    const markdown = "![](c0-1-12.png?svgimg=50,100,80,-5,2.5)";
    const result = transformSvgImages(markdown, imageDirectory);

    assert.deepStrictEqual(result.diagnostics, []);
    assert.match(result.text, /width="100mm" height="80mm"/);
    assert.match(result.text, /xlink:href="c0-1-12\.png"/);
    assert.match(result.text, /translate\(-5,2\.5\) scale\(0\.5\)/);
  });

  test("supports angle-bracket paths, parentheses, URL encoding, and a title", () => {
    const result = transformSvgImages('![author\'s sample](<images/sample%20(1).png?svgimg=100> "title")', "C:/book", fakeOptions());

    assert.deepStrictEqual(result.diagnostics, []);
    assert.match(result.text, /xlink:href="images\/sample \(1\)\.png"/);
  });

  test("accepts an apostrophe in a destination", () => {
    const result = transformSvgImages("![](images/author's.png?svgimg=100)", "C:/book", fakeOptions());

    assert.deepStrictEqual(result.diagnostics, []);
    assert.match(result.text, /xlink:href="images\/author's\.png"/);
  });

  test("escapes special characters in the generated href", () => {
    const result = transformSvgImages("![](images/a&b.png?svgimg=100)", "C:/book", fakeOptions());

    assert.match(result.text, /xlink:href="images\/a&amp;b\.png"/);
  });

  test("leaves missing or unreadable images unchanged and reports diagnostics", () => {
    const markdown = "![](missing.png?svgimg=100)";
    const result = transformSvgImages(markdown, imageDirectory);

    assert.strictEqual(result.text, markdown);
    assert.strictEqual(result.diagnostics.length, 1);
    assert.strictEqual(result.diagnostics[0].code, "IMAGE_READ_FAILED");
  });

  test("rejects invalid numeric parameters without generating NaN", () => {
    for (const parameters of ["", "abc", "0", "100,-1", "100,1,2,3,4,5"]) {
      const markdown = `![](c0-1-12.png?svgimg=${parameters})`;
      const result = transformSvgImages(markdown, imageDirectory);

      assert.strictEqual(result.text, markdown);
      assert.strictEqual(result.diagnostics[0].code, "INVALID_PARAMETERS");
      assert.doesNotMatch(result.text, /NaN/);
    }
  });

  test("rejects remote URLs and formats outside the safe allowlist", () => {
    const remote = transformSvgImages("![](https://example.com/a.png?svgimg=100)", imageDirectory);
    const unsupported = transformSvgImages("![](sample.icns?svgimg=100)", imageDirectory);

    assert.strictEqual(remote.diagnostics[0].code, "INVALID_PATH");
    assert.strictEqual(unsupported.diagnostics[0].code, "UNSUPPORTED_FORMAT");
  });

  test("does not transform image-like text inside code", () => {
    const inline = "`![](c0-1-12.png?svgimg=100)`";
    const fenced = "```md\n![](c0-1-12.png?svgimg=100)\n```\n";

    assert.strictEqual(transformSvgImages(inline, imageDirectory).text, inline);
    assert.strictEqual(transformSvgImages(fenced, imageDirectory).text, fenced);
  });

  test("continues converting valid images when another image fails", () => {
    const markdown = "![](missing.png?svgimg=100)\n![](c0-1-12.png?svgimg=100)";
    const result = transformSvgImages(markdown, imageDirectory);

    assert.strictEqual(result.diagnostics.length, 1);
    assert.match(result.text, /!\[\]\(missing\.png\?svgimg=100\)/);
    assert.match(result.text, /<svg /);
  });
});

function fakeOptions() {
  return {
    fileSystem: {
      statSync: () => ({ isFile: () => true, size: 100 }),
      readFileSync: () => Uint8Array.from([0]),
    },
    measureImage: () => ({ width: 720, height: 360 }),
  };
}
