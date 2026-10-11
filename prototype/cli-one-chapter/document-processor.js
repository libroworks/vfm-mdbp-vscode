import path from "node:path";
import { VFM } from "@vivliostyle/cli";
import { transformSvgImages } from "./svgimg-transformer.cjs";
import { postprocessHtml } from "./html-postprocess.cjs";

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
      return postprocessHtml(html, root);
    };
  });
}

export { createDocumentProcessor };
