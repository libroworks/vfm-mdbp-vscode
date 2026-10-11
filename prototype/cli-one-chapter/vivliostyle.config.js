import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDocumentProcessor } from "./document-processor.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../exampleFiles");
export default {
  entryContext: root,
  entry: [{ path: "formattest.md", output: "formattest.html" }],
  workspaceDir: path.join(directory, "output/workspace"),
  output: [{ path: path.join(directory, "output/webpub"), format: "webpub" }],
  documentProcessor: createDocumentProcessor(root),
};
