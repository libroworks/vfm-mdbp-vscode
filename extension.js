// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const { MarkdownBookPreviewConvert } = require("./lib/markdown-book-preview-convert");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vfmdbp-vscode" is now active!');

  context.subscriptions.push(vscode.commands.registerCommand("vfmdbp-vscode.exportXML", exportXML));
  context.subscriptions.push(
    vscode.commands.registerCommand("vfmdbp-vscode.previewThisCLI", () => {
      const htmlfilepath = convertMD2HTML();
      if (htmlfilepath) {
        callShell(`vivliostyle preview "${htmlfilepath}"`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("vfmdbp-vscode.buildThisCLI", () => {
      const htmlfilepath = convertMD2HTML();
      if (htmlfilepath) {
        const outputpath = htmlfilepath.replace(/.html$/, ".pdf");
        callShell(`vivliostyle build "${htmlfilepath}" -o "${outputpath}"`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("vfmdbp-vscode.previewByConfig", function () {
      callShell("vivliostyle preview");
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("vfmdbp-vscode.buildByConfig", function () {
      callShell("vivliostyle build");
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("vfmdbp-vscode.installCLI", function () {
      console.log(vscode.env.shell);
      if (vscode.env.shell.startsWith("C:\\")) {
        callShell("npm install -g @vivliostyle/cli");
      } else {
        callShell("sudo npm install -g @vivliostyle/cli");
      }
    })
  );

  // 自動更新設定（WorkSpace内のファイルが更新され、それがMarkdownであればHTMLを書き出す）
  vscode.workspace.onDidSaveTextDocument((event) => {
    convertMD2HTML();
  });

  // InDesign用のXMLを書き出す
  function exportXML() {
    console.log("MarkdownBookPreview export XML");
    const editor = vscode.window.activeTextEditor;
    if (checkEditorPath(editor) === false) return;
    // プレビューしたいパスやVSmodeを設定
    const mdpath = editor.document.fileName;
    const htmlfilepath = convertMD2HTML(mdpath);
    MarkdownBookPreviewConvert.exportInDesignXML(htmlfilepath);
  }

  // Markdownファイルの変換
  function convertMD2HTML() {
    const editor = vscode.window.activeTextEditor;
    if (checkEditorPath(editor) === false) return null;
    // プレビューしたいパスやVSmodeを設定
    const mdpath = editor.document.fileName.replace(/^[a-z]:/, (d) => d.toUpperCase());
    console.log(mdpath);
    const homePath = MarkdownBookPreviewConvert.searchHomepath(mdpath);
    const htmlfilepath = MarkdownBookPreviewConvert.convertMarkdown(mdpath, homePath);
    return htmlfilepath;
  }

  // ターミナルにコマンドを発行する
  function callShell(shellcommand) {
    const term = vscode.window.activeTerminal?.name === "vivliostyle-cli-helper" ? vscode.window.activeTerminal : vscode.window.createTerminal("vivliostyle-cli-helper");
    term.show();
    // PowerShellかつvivliostyleスクリプトの実行時のみ許可が必要
    if (vscode.env.shell.includes("powershell") && shellcommand.indexOf("vivliostyle") === 0) {
      term.sendText(`PowerShell -ExecutionPolicy RemoteSigned ${shellcommand}`);
    } else {
      term.sendText(shellcommand);
    }
  }

  // チェック
  function checkEditorPath(editor) {
    if (editor === null || editor === undefined) return false;
    const path = editor.document.fileName;
    if (!path) {
      vscode.window.showWarningMessage("ファイルを保存してから実行してください");
      return false;
    }
    if (!path.endsWith(".md")) {
      vscode.window.showWarningMessage("Mardownファイルではありません");
      return false;
    }
    return true;
  }

  // ターミナルにコマンドを発行する
  function callShell(shellcommand) {
    const term = vscode.window.activeTerminal?.name === "vivliostyle-cli-helper" ? vscode.window.activeTerminal : vscode.window.createTerminal("vivliostyle-cli-helper");
    term.show();
    // PowerShellかつvivliostyleスクリプトの実行時のみ許可が必要
    if (vscode.env.shell.includes("powershell") && shellcommand.indexOf("vivliostyle") === 0) {
      term.sendText(`PowerShell -ExecutionPolicy RemoteSigned ${shellcommand}`);
    } else {
      term.sendText(shellcommand);
    }
  }
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
