const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { generateConfig, findConfigRoot, currentFileConfig, exportHtml, EXISTS_MESSAGE } = require("../../lib/cli-project");

suite("CLI project generation", () => {
  function fixture(callback) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mdbp-cli-"));
    try { callback(directory); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  const assets = path.resolve(__dirname, "../../cli-runtime");

  test("refuses an existing config before writing any helper files", () => fixture((root) => {
    fs.writeFileSync(path.join(root, "vivliostyle.config.js"), "manual config");
    assert.throws(() => generateConfig(root, path.join(root, "chapter.md"), assets), { message: EXISTS_MESSAGE });
    assert.equal(fs.readFileSync(path.join(root, "vivliostyle.config.js"), "utf8"), "manual config");
    assert.ok(!fs.existsSync(path.join(root, ".mdbp-cli")));
  }));

  test("generates portable config and runtime with only the selected chapter", () => fixture((root) => {
    const chapter = path.join(root, "chapters", "chapter.md");
    const config = generateConfig(root, chapter, assets);
    const source = fs.readFileSync(config, "utf8");
    assert.match(source, /chapters\/chapter.md/);
    assert.ok(!source.includes(root));
    assert.ok(!source.includes("mdbplist"));
    assert.ok(fs.existsSync(path.join(root, ".mdbp-cli", "svgimg-transformer.cjs")));
    assert.equal(findConfigRoot(path.dirname(chapter), root), root);
    const current = currentFileConfig(root, chapter);
    assert.match(fs.readFileSync(current, "utf8"), /chapter.pdf/);
    assert.notEqual(currentFileConfig(root, chapter), current);
    assert.equal(fs.readFileSync(config, "utf8"), source);
  }));

  test("supports projects that explicitly use ES modules", () => fixture((root) => {
    fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
    const config = generateConfig(root, path.join(root, "chapter.md"), assets);
    assert.match(fs.readFileSync(config, "utf8"), /export default/);
    assert.doesNotMatch(fs.readFileSync(config, "utf8"), /module.exports/);
  }));

  test("removes a reserved incomplete config on generation failure", () => fixture((root) => {
    assert.throws(() => generateConfig(root, path.join(root, "chapter.md"), path.join(root, "missing")));
    assert.ok(!fs.existsSync(path.join(root, "vivliostyle.config.js")));
  }));

  test("HTML export preserves existing HTML when dependencies are missing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdbp-export-"));
    try {
      const markdown = path.join(root, "chapter.md");
      const html = path.join(root, "chapter.html");
      fs.writeFileSync(html, "existing HTML");
      await assert.rejects(exportHtml(root, markdown), /npm install/);
      assert.equal(fs.readFileSync(html, "utf8"), "existing HTML");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test("menus launch CLI without invoking legacy conversion or save monitoring", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdbp-command-"));
    const registered = new Map();
    const sent = [];
    const errors = [];
    const opened = [];
    let conversions = 0;
    let failConversion = false;
    const document = { fileName: path.join(root, "chapter.md"), uri: { scheme: "file" }, isDirty: true,
      async save() { this.isDirty = false; return true; } };
    const mock = {
      commands: { registerCommand(id, handler) { registered.set(id, handler); return {}; } },
      workspace: { getWorkspaceFolder: () => ({ uri: { fsPath: root } }), textDocuments: [document],
        openTextDocument: async () => document },
      env: { shell: "powershell.exe", openExternal: async (uri) => { opened.push(uri); return true; } },
      Uri: { file: (fileName) => fileName },
      window: { activeTextEditor: { document }, showTextDocument: async () => {},
        showInformationMessage: async () => {}, showErrorMessage: async (message) => { errors.push(message); },
        onDidCloseTerminal: () => ({}), createTerminal: () => ({ show() {}, sendText: (command) => sent.push(command) }) },
    };
    const originalLoad = Module._load;
    const extensionPath = require.resolve("../../extension");
    try {
      fs.writeFileSync(document.fileName, "# Chapter\n");
      Module._load = function (name, ...args) {
        if (name === "vscode") return mock;
        if (name === "./lib/cli-project") return {
          ...require("../../lib/cli-project"),
          async exportHtml(project, source) {
            assert.equal(project, root);
            assert.equal(document.isDirty, false);
            if (failConversion) throw new Error("CLI failed");
            conversions++;
            const html = source.replace(/\.md$/i, ".html");
            fs.writeFileSync(html, "<html><body><h1>New output</h1></body></html>");
            return html;
          },
        };
        return originalLoad.call(this, name, ...args);
      };
      delete require.cache[extensionPath];
      const extension = require(extensionPath);
      Module._load = originalLoad;
      extension.activate({ extensionPath: path.resolve(__dirname, "../.."), subscriptions: [] });
      await registered.get("vfmdbp-vscode.generateConfig")();
      assert.match(sent[0], /npm.cmd install/);
      const bin = path.join(root, ".mdbp-cli/node_modules/.bin");
      fs.mkdirSync(bin, { recursive: true });
      fs.writeFileSync(path.join(bin, process.platform === "win32" ? "vivliostyle.cmd" : "vivliostyle"), "");
      for (const id of ["previewByConfig", "buildByConfig", "previewThisCLI", "buildThisCLI"]) {
        await registered.get(`vfmdbp-vscode.${id}`)();
      }
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.equal(document.isDirty, false);
      assert.equal(sent.length, 5);
      assert.ok(sent.slice(1).every((command) => command.includes("--config") && command.includes("npm.cmd exec")));
      assert.ok(!fs.existsSync(path.join(root, "chapter.html")));
      await registered.get("vfmdbp-vscode.convertMD2HTMLonly")();
      assert.deepEqual(opened, [path.join(root, "chapter.html")]);
      await registered.get("vfmdbp-vscode.exportXML")();
      assert.equal(conversions, 2);
      const xmlPath = path.join(root, "chapter.xml");
      assert.match(fs.readFileSync(xmlPath, "utf8"), /New output/);
      fs.writeFileSync(xmlPath, "keep existing XML on failure");
      failConversion = true;
      await registered.get("vfmdbp-vscode.exportXML")();
      assert.equal(fs.readFileSync(xmlPath, "utf8"), "keep existing XML on failure");
      assert.match(errors[0], /CLI failed/);
      document.fileName = path.join(root, "chapter.html");
      await registered.get("vfmdbp-vscode.exportXML")();
      assert.equal(conversions, 2, "HTML input should bypass Markdown conversion");
      assert.match(fs.readFileSync(xmlPath, "utf8"), /New output/);
    } finally {
      Module._load = originalLoad;
      delete require.cache[extensionPath];
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
