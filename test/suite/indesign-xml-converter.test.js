const assert = require("assert");
const cheerio = require("cheerio");
const { convertHtmlToInDesignXml } = require("../../lib/indesign-xml-converter");

suite("InDesign XML converter", () => {
  test("preserves code indentation, blank lines, and trailing newline exactly", () => {
    const code = "function sample() {\n  if (true) {\n    return 1;\n  }\n\n}\n";
    const html = `<html><body>\n  <pre class="language-js"><code class="language-js">${code}</code></pre>\n</body></html>`;

    const xml = convertHtmlToInDesignXml(html);
    const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });

    assert.strictEqual($("code_language-js").text(), code);
    assert.ok(!$("pre_language-js").text().startsWith("  function"));
  });

  test("preserves whitespace around syntax-highlight spans", () => {
    const html = [
      "<html><body>",
      '<pre class="language-py"><code class="language-py">',
      '<span class="token_keyword">if</span> value:',
      '    <span class="token_keyword">return</span> value',
      "</code></pre>",
      "</body></html>",
    ].join("\n");
    const expected = "\nif value:\n    return value\n";

    const xml = convertHtmlToInDesignXml(html);
    const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });

    assert.strictEqual($("code_language-py").text(), expected);
  });

  test("replaces pretty-print indentation with InDesign paragraph separators", () => {
    const html = "<html><body>\n    <section>\n      <h1>heading</h1>\n      <p>first</p>\n      <p>second</p>\n    </section>\n  </body></html>";

    const xml = convertHtmlToInDesignXml(html);

    assert.ok(xml.includes("<story"));
    assert.ok(xml.includes("<section><h1>heading</h1>\n<p>first</p>\n<p>second</p></section>"));
    assert.ok(!xml.includes("\n    "));
  });

  test("separates headings, paragraphs, pre blocks, and list items for InDesign", () => {
    const html = [
      "<html><body><section>",
      "<h2>heading</h2>",
      "<p>paragraph</p>",
      "<pre><code>  code</code></pre>",
      "<ul><li>first</li><li>second</li></ul>",
      "</section></body></html>",
    ].join("");

    const xml = convertHtmlToInDesignXml(html);

    assert.match(xml, /<h2>heading<\/h2>\n<p>paragraph<\/p>\n<pre>/);
    assert.match(xml, /<\/pre><ul>\n<ul_li>first<\/ul_li>\n<ul_li>second<\/ul_li><\/ul>/);
  });

  test("does not add a second separator when code already ends with a newline", () => {
    const html = "<html><body><pre><code>code\n</code></pre><p>after</p></body></html>";

    const xml = convertHtmlToInDesignXml(html);

    assert.match(xml, /<code>code\n<\/code><\/pre><p>after<\/p>/);
    assert.doesNotMatch(xml, /code\n<\/code><\/pre>\n<p>/);
  });

  test("keeps meaningful spaces between inline elements", () => {
    const html = "<html><body><p><strong>first</strong> <em>second</em></p></body></html>";
    const xml = convertHtmlToInDesignXml(html);
    const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });

    assert.strictEqual($("p").text(), "first second");
  });

  test("keeps existing InDesign mappings for tables and images", () => {
    const html = [
      "<html><body>",
      "<table><thead><tr><th>heading</th></tr></thead>",
      "<tbody><tr><td>value</td></tr></tbody></table>",
      '<img src="images/sample.png">',
      "</body></html>",
    ].join("\n");

    const xml = convertHtmlToInDesignXml(html);
    const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });

    assert.strictEqual($("thead").length, 0);
    assert.strictEqual($("tbody").length, 0);
    assert.deepStrictEqual(
      $("td")
        .toArray()
        .map((node) => $(node).text()),
      ["heading", "value"]
    );
    assert.strictEqual($("img").attr("href"), "file://images/sample.png");
  });

  test("escapes XML special characters without changing their text value", () => {
    const html = "<html><body><p>A &amp; B &lt; C</p></body></html>";
    const xml = convertHtmlToInDesignXml(html);
    const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });

    assert.strictEqual($("p").text(), "A & B < C");
    assert.ok(xml.includes("A &amp; B &lt; C"));
  });
});
