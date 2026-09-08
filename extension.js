const path = require("path");
const vscode = require("vscode");
const { MarkdownBookPreviewConvert } = require("./lib/markdown-book-preview-convert");

const MESSAGE_PREFIX = "MDBP";

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const terminals = new Map();

  registerCommand("vfmdbp-vscode.exportXML", "InDesign XMLの書き出し", () => {
    const document = requireActiveMarkdownDocument();
    const htmlPath = convertDocument(document);
    const xmlPath = MarkdownBookPreviewConvert.exportInDesignXML(htmlPath);
    return `XMLを書き出しました: ${xmlPath}`;
  });

  registerCommand("vfmdbp-vscode.previewThisCLI", "現在のファイルのプレビュー", () => {
    const document = requireActiveMarkdownDocument();
    const htmlPath = convertDocument(document);
    callShell(`vivliostyle preview "${htmlPath}"`, getDocumentRoot(document));
    return `プレビューを開始しました: ${htmlPath}`;
  });

  registerCommand("vfmdbp-vscode.convertMD2HTMLonly", "HTMLの更新", async () => {
    const document = requireActiveMarkdownDocument();
    const htmlPath = convertDocument(document);
    const opened = await vscode.env.openExternal(vscode.Uri.file(htmlPath));
    if (!opened) throw new Error(`HTMLファイルを開けません: ${htmlPath}`);
    return `HTMLを更新しました: ${htmlPath}`;
  });

  registerCommand("vfmdbp-vscode.buildThisCLI", "現在のファイルのPDFビルド", () => {
    const document = requireActiveMarkdownDocument();
    const htmlPath = convertDocument(document);
    const outputPath = htmlPath.replace(/\.html$/i, ".pdf");
    callShell(`vivliostyle build "${htmlPath}" -o "${outputPath}"`, getDocumentRoot(document));
    return `PDFビルドを開始しました: ${outputPath}`;
  });

  registerCommand("vfmdbp-vscode.previewByConfig", "設定ファイルによる連結プレビュー", () => {
    const rootPath = getOperationRoot();
    const convertedFiles = MarkdownBookPreviewConvert.convertByMarkdownList(rootPath);
    callShell("vivliostyle preview", rootPath);
    return `連結プレビューを開始しました（${convertedFiles.length}ファイルを更新）: ${rootPath}`;
  });

  registerCommand("vfmdbp-vscode.buildByConfig", "設定ファイルによる連結PDFビルド", () => {
    const rootPath = getOperationRoot();
    const convertedFiles = MarkdownBookPreviewConvert.convertByMarkdownList(rootPath);
    callShell("vivliostyle build", rootPath);
    return `連結PDFビルドを開始しました（${convertedFiles.length}ファイルを更新）: ${rootPath}`;
  });

  registerCommand("vfmdbp-vscode.installCLI", "Vivliostyle CLIのインストール", () => {
    callShell(getInstallCommand("npm install -g @vivliostyle/cli"), getOptionalOperationRoot());
    return "Vivliostyle CLIのインストールを開始しました";
  });

  registerCommand("vfmdbp-vscode.installCLI8", "Vivliostyle CLI v8のインストール", () => {
    callShell(getInstallCommand("npm install -g @vivliostyle/cli@8"), getOptionalOperationRoot());
    return "Vivliostyle CLI v8のインストールを開始しました";
  });

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isMarkdownDocument(document)) return;
      try {
        convertDocument(document);
      } catch (error) {
        showFailure("保存時のHTML更新", error);
      }
    })
  );

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
    if (shell.includes("powershell") && shellCommand.startsWith("vivliostyle")) {
      terminal.sendText(`PowerShell -ExecutionPolicy RemoteSigned ${shellCommand}`);
    } else {
      terminal.sendText(shellCommand);
    }
  }
}

function convertDocument(document) {
  if (!isMarkdownDocument(document)) throw new Error("保存済みのMarkdownファイルを選択してください");
  const markdownPath = normalizeWindowsDriveLetter(document.fileName);
  const rootPath = getDocumentRoot(document);
  const homePath = MarkdownBookPreviewConvert.searchHomepath(markdownPath, "_postReplaceList.json", rootPath);
  return MarkdownBookPreviewConvert.convertMarkdown(markdownPath, homePath);
}

function requireActiveMarkdownDocument() {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) throw new Error("アクティブなエディターがありません");
  if (!isMarkdownDocument(document)) throw new Error("保存済みのMarkdownファイルを選択してください");
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

function normalizeWindowsDriveLetter(filePath) {
  return filePath.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
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
