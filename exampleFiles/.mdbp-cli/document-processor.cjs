const path = require("node:path");
const { VFM } = require("@vivliostyle/vfm");
const { transformSvgImages } = require("./svgimg-transformer.cjs");
const { postprocessHtml } = require("./html-postprocess.cjs");

// Wrap the parser and serializer so string replacements retain legacy ordering.
function createDocumentProcessor(root) {
  return (options, metadata) => VFM(options, metadata).use(function () {
    const originalParser = this.Parser;
    const originalCompiler = this.Compiler;
    this.Parser = function (markdown, file) {
      const result = transformSvgImages(markdown, path.dirname(file.path));
      for (const diagnostic of result.diagnostics) file.message(diagnostic.message);
      // remark-parse 8 reads file.contents rather than the constructor argument.
      file.contents = result.text;
      return originalParser.prototype?.parse
        ? new originalParser(result.text, file).parse()
        : originalParser(result.text, file);
    };
    this.Compiler = function (tree, file) {
      const html = originalCompiler.prototype?.compile
        ? new originalCompiler(tree, file).compile()
        : originalCompiler(tree, file);
      return postprocessHtml(html, findHome(path.dirname(file.path), root));
    };
  });
}

module.exports = { createDocumentProcessor };

function findHome(directory, root) {
  const fs = require("node:fs");
  let current = path.resolve(directory);
  const boundary = path.resolve(root);
  while (true) {
    if (fs.existsSync(path.join(current, "_postReplaceList.json"))) return current;
    if (current === boundary || path.dirname(current) === current) return boundary;
    const relative = path.relative(boundary, current);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return boundary;
    current = path.dirname(current);
  }
}
