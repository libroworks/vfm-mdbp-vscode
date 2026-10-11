const path = require("path");
const fs = require("fs");
const { generateConfig, findConfigRoot, currentFileConfig, exportHtml } = require("./lib/cli-project");
const vscode = require("vscode");
const { convertHtmlToInDesignXml } = require("./lib/indesign-xml-converter");

const MESSAGE_PREFIX = "MDBP";

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const terminals = new Map();

  registerCommand("vfmdbp-vscode.exportXML", "InDesign XMLの書き出し", async () => {
    const document = requireActiveSourceDocument();
    await saveDocument(document);
    const htmlPath = isMarkdownDocument(document) ? await convertDocument(document) : document.fileName;
    const xmlPath = htmlPath.replace(/\.html$/i, ".xml");
    fs.writeFileSync(xmlPath, convertHtmlToInDesignXml(fs.readFileSync(htmlPath, "utf8")), "utf8");
    return `XMLを書き出しました: ${xmlPath}`;
  });

  registerCommand("vfmdbp-vscode.generateConfig", "Vivliostyle設定生成", async () => {
    const document = requireActiveMarkdownDocument();
    const root = getDocumentRoot(document);
    const configPath = generateConfig(root, document.fileName, path.join(context.extensionPath, "cli-runtime"));
    const configDocument = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(configDocument);
    callShell('npm install --prefix ".mdbp-cli"', root);
    return `設定を生成しました: ${configPath}。ターミナルで依存パッケージのインストールが完了してからプレビュー／ビルドを実行してください。`;
  });

  registerCommand("vfmdbp-vscode.previewThisCLI", "現在のファイルのプレビュー", async () => {
    const document = requireActiveSourceDocument();
    await saveDocument(document);
    const root = findConfigRoot(path.dirname(document.fileName), getDocumentRoot(document));
    launchCLI("preview", root, currentFileConfig(root, document.fileName));
  });

  registerCommand("vfmdbp-vscode.convertMD2HTMLonly", "HTMLの更新", async () => {
    const document = requireActiveMarkdownDocument();
    const htmlPath = await convertDocument(document);
    const opened = await vscode.env.openExternal(vscode.Uri.file(htmlPath));
    if (!opened) throw new Error(`HTMLファイルを開けません: ${htmlPath}`);
    return `HTMLを更新しました: ${htmlPath}`;
  });

  registerCommand("vfmdbp-vscode.buildThisCLI", "現在のファイルのPDFビルド", async () => {
    const document = requireActiveSourceDocument();
    await saveDocument(document);
    const root = findConfigRoot(path.dirname(document.fileName), getDocumentRoot(document));
    launchCLI("build", root, currentFileConfig(root, document.fileName));
  });

  registerCommand("vfmdbp-vscode.previewByConfig", "設定ファイルによる連結プレビュー", async () => {
    await saveProjectDocuments();
    const root = operationConfigRoot();
    launchCLI("preview", root, path.join(root, "vivliostyle.config.js"));
  });

  registerCommand("vfmdbp-vscode.buildByConfig", "設定ファイルによる連結PDFビルド", async () => {
    await saveProjectDocuments();
    const root = operationConfigRoot();
    launchCLI("build", root, path.join(root, "vivliostyle.config.js"));
  });

  function operationConfigRoot() {
    const document = vscode.window.activeTextEditor?.document;
    const root = getOperationRoot();
    return findConfigRoot(document?.uri.scheme === "file" ? path.dirname(document.fileName) : root, root);
  }

  function launchCLI(action, root, configPath) {
    const helper = path.join(root, ".mdbp-cli");
    const local = path.join(helper, "node_modules", ".bin", process.platform === "win32" ? "vivliostyle.cmd" : "vivliostyle");
    const generated = fs.existsSync(path.join(helper, "package.json"));
    if (generated && !fs.existsSync(local)) {
      throw new Error('プロジェクトフォルダーで npm install --prefix ".mdbp-cli" を実行してください。');
    }
    const command = generated ? `npm exec --prefix ${shellQuote(helper)} -- vivliostyle` : "vivliostyle";
    callShell(`${command} ${action} --config ${shellQuote(configPath)}`, root);
    return undefined;
  }

  registerCommand("vfmdbp-vscode.installCLI", "Vivliostyle CLIのインストール", () => {
    callShell(getInstallCommand("npm install -g @vivliostyle/cli"), getOptionalOperationRoot());
    return "Vivliostyle CLIのインストールを開始しました";
  });

  registerCommand("vfmdbp-vscode.installCLI8", "Vivliostyle CLI v8のインストール", () => {
    callShell(getInstallCommand("npm install -g @vivliostyle/cli@8"), getOptionalOperationRoot());
    return "Vivliostyle CLI v8のインストールを開始しました";
  });

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [key, value] of terminals) {
        if (value === terminal) terminals.delete(key);
      }
    })
  );

  function registerCommand(commandId, action, handler) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, () => runCommand(action, handler)));
  }

  async function runCommand(action, handler) {
    try {
      const message = await handler();
      if (message) await vscode.window.showInformationMessage(`${MESSAGE_PREFIX}: ${message}`);
    } catch (error) {
      showFailure(action, error);
    }
  }

  function callShell(shellCommand, cwd) {
    const terminalKey = cwd ? path.resolve(cwd) : "__default__";
    let terminal = terminals.get(terminalKey);
    if (!terminal || terminal.exitStatus) {
      terminal = vscode.window.createTerminal({ name: "vivliostyle-cli-helper", ...(cwd ? { cwd } : {}) });
      terminals.set(terminalKey, terminal);
    }

    terminal.show();
    const shell = (vscode.env.shell || "").toLowerCase();
    terminal.sendText(shell.includes("powershell") || shell.includes("pwsh")
      ? shellCommand.replace(/^npm /, "npm.cmd ").replace(/^vivliostyle /, "vivliostyle.cmd ")
      : shellCommand);
  }
}

async function convertDocument(document) {
  if (!isMarkdownDocument(document)) throw new Error("保存済みのMarkdownファイルを選択してください");
  await saveDocument(document);
  const rootPath = findConfigRoot(path.dirname(document.fileName), getDocumentRoot(document));
  return exportHtml(rootPath, document.fileName);
}

function requireActiveMarkdownDocument() {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) throw new Error("アクティブなエディターがありません");
  if (!isMarkdownDocument(document)) throw new Error("保存済みのMarkdownファイルを選択してください");
  return document;
}

function requireActiveSourceDocument() {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.uri.scheme !== "file" || !/\.(md|html)$/i.test(document.fileName)) {
    throw new Error("保存済みのMarkdownまたはHTMLファイルを選択してください。");
  }
  return document;
}

function isMarkdownDocument(document) {
  return Boolean(document && document.uri.scheme === "file" && document.fileName && document.fileName.toLowerCase().endsWith(".md"));
}

function getDocumentRoot(document) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder?.uri.fsPath || path.dirname(document.fileName);
}

function getOperationRoot() {
  const rootPath = getOptionalOperationRoot();
  if (rootPath) return rootPath;
  throw new Error("対象フォルダーを特定できません。ファイルまたはワークスペースを開いてください");
}

function getOptionalOperationRoot() {
  const document = vscode.window.activeTextEditor?.document;
  if (document?.uri.scheme === "file" && document.fileName) return getDocumentRoot(document);

  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  if (workspaceFolders.length === 1) return workspaceFolders[0].uri.fsPath;
  return undefined;
}

function getInstallCommand(command) {
  return (vscode.env.shell || "").startsWith("C:\\") ? command : `sudo ${command}`;
}

function showFailure(action, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return vscode.window.showErrorMessage(`${MESSAGE_PREFIX}: ${action}に失敗しました — ${detail}`);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  convertDocument,
  getDocumentRoot,
  isMarkdownDocument,
};

async function saveDocument(document) {
  if (document.isDirty && !(await document.save())) throw new Error("ドキュメントを保存できませんでした。");
}

async function saveProjectDocuments() {
  const root = getOperationRoot();
  for (const document of vscode.workspace.textDocuments) {
    if (document.uri.scheme !== "file") continue;
    const relative = path.relative(root, document.fileName);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) await saveDocument(document);
  }
}

function shellQuote(value) {
  const shell = (vscode.env.shell || "").toLowerCase();
  if (shell.includes("powershell") || shell.includes("pwsh")) return "'" + value.replace(/'/g, "''") + "'";
  if (process.platform === "win32") {
    if (/["%\r\n]/.test(value)) throw new Error("Unsupported shell characters in path.");
    return '"' + value + '"';
  }
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}
