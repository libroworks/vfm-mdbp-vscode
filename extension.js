// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { MarkdownBookPreviewServer } = require('./lib/markdown-book-preview-server');
const { MarkdownBookPreviewConvert } = require('./lib/markdown-book-preview-convert');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const markdownBookPreviewServer = new MarkdownBookPreviewServer();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vfmdbp-vscode" is now active!');

  context.subscriptions.push(vscode.commands.registerCommand('vfmdbp-vscode.startServer', startServer));
  context.subscriptions.push(vscode.commands.registerCommand('vfmdbp-vscode.stopServer', stopServer));
  context.subscriptions.push(vscode.commands.registerCommand('vfmdbp-vscode.toggle', toggle));
  context.subscriptions.push(vscode.commands.registerCommand('vfmdbp-vscode.toggleVS', toggleVS));
  context.subscriptions.push(vscode.commands.registerCommand('vfmdbp-vscode.exportXML', exportXML));
  context.subscriptions.push(
    vscode.commands.registerCommand('vfmdbp-vscode.previewThisCLI', () => {
      const htmlfilepath = convertMD2HTML();
      if (htmlfilepath) {
        callShell(`vivliostyle preview "${htmlfilepath}"`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('vfmdbp-vscode.buildThisCLI', () => {
      const htmlfilepath = convertMD2HTML();
      if (htmlfilepath) {
        // callShell(`vivliostyle build "${htmlfilepath}"`);
        const outputpath = htmlfilepath.replace(/.html$/, '.pdf');
        callShell(`vivliostyle build "${htmlfilepath}" -o "${outputpath}"`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('vfmdbp-vscode.previewByConfig', function () {
      callShell('vivliostyle preview');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('vfmdbp-vscode.buildByConfig', function () {
      callShell('vivliostyle build');
    })
  );

  // 自動更新設定（WorkSpace内のファイルが更新され、それがMarkdownであればHTMLを書き出す）
  vscode.workspace.onDidSaveTextDocument((event) => {
    convertMD2HTML();
  });

  // サーバーの起動終了
  function startServer() {
    markdownBookPreviewServer.startWebServer();
  }
  function stopServer() {
    markdownBookPreviewServer.stopWebServer();
  }

  // 生のHTMLで開く
  function toggle(vsmode = false) {
    console.log('MarkdownBookPreview was toggled!');
    const editor = vscode.window.activeTextEditor;
    if (checkEditorPath(editor) === false) return;
    // プレビューしたいパスやVSmodeを設定
    const mdpath = editor.document.fileName;
    console.log(mdpath);
    markdownBookPreviewServer.setTargetMarkdownFile(mdpath, vsmode);
  }

  // Vivliostyleで開く
  function toggleVS() {
    console.log('Vivliostyle Mode');
    toggle(true);
  }

  // InDesign用のXMLを書き出す
  function exportXML() {
    console.log('MarkdownBookPreview export XML');
    const editor = vscode.window.activeTextEditor;
    if (checkEditorPath(editor) === false) return;
    // プレビューしたいパスやVSmodeを設定
    const mdpath = editor.document.fileName;
    markdownBookPreviewServer.exportInDesignXML(mdpath);
  }

  // Markdownファイルの変換
  function convertMD2HTML() {
    const editor = vscode.window.activeTextEditor;
    if (checkEditorPath(editor) === false) return null;
    // プレビューしたいパスやVSmodeを設定
    const mdpath = editor.document.fileName.replace(/^[a-z]:/, (d) => d.toUpperCase());
    console.log(mdpath);
    const homePath = MarkdownBookPreviewServer.searchHomepath(mdpath);
    const htmlfilepath = MarkdownBookPreviewConvert.convertMarkdown(mdpath, homePath);
    return htmlfilepath;
  }

  // ターミナルにコマンドを発行する
  function callShell(shellcommand) {
    const term = vscode.window.activeTerminal?.name === 'vivliostyle-cli-helper' ? vscode.window.activeTerminal : vscode.window.createTerminal('vivliostyle-cli-helper');
    term.show();
    // PowerShellかつvivliostyleスクリプトの実行時のみ許可が必要
    if (vscode.env.shell.includes('powershell') && shellcommand.indexOf('vivliostyle') === 0) {
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
      vscode.window.showWarningMessage('ファイルを保存してから実行してください');
      return false;
    }
    if (!path.endsWith('.md')) {
      vscode.window.showWarningMessage('Mardownファイルではありません');
      return false;
    }
    return true;
  }

  // ターミナルにコマンドを発行する
  function callShell(shellcommand) {
    const term = vscode.window.activeTerminal?.name === 'vivliostyle-cli-helper' ? vscode.window.activeTerminal : vscode.window.createTerminal('vivliostyle-cli-helper');
    term.show();
    // PowerShellかつvivliostyleスクリプトの実行時のみ許可が必要
    if (vscode.env.shell.includes('powershell') && shellcommand.indexOf('vivliostyle') === 0) {
      term.sendText(`PowerShell -ExecutionPolicy RemoteSigned ${shellcommand}`);
    } else {
      term.sendText(shellcommand);
    }
  }

  // Shellコマンド発行テスト
  function callShellTest() {
    const term = vscode.window.createTerminal();
    const shell = vscode.env.shell;
    const shellcommand = 'vivliostyle build';
    term.show();
    if (shell.includes('powershell')) {
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
