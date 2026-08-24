const fs = require("fs");
const path = require("path");
const { stringify } = require("@vivliostyle/vfm");
const cheerio = require("cheerio");
const vscode = require("vscode");
const { convertHtmlToInDesignXml } = require("./indesign-xml-converter");
const { transformSvgImages } = require("./svgimg-transformer");

class MarkdownBookPreviewConvert {
  // markdownファイルを変換
  static convertMarkdown(mdpath, homepath) {
    const workdir = path.dirname(mdpath);

    //書き出しファイル名
    const htmlfilepath = mdpath.replace(".md", ".html");

    // ファイルを読み込み
    let src;
    try {
      src = fs.readFileSync(mdpath, "utf-8");
    } catch (err) {
      throw new Error(`Markdownファイルを読み込めません: ${mdpath} (${err.message})`);
    }

    // 画像のsvg変換
    src = MarkdownBookPreviewConvert.svgimg(src, workdir);

    // vfmで変換
    // let html = marked(src);
    let html = stringify(src);

    // 強引な後処理 閉じpreの後に改行（入れないとXML変換時にトラブルと思う）
    html = html.replace(/<\/pre>/g, "</pre>\n");

    // _postReplaceList.jsonがあれば後置換を実行
    const replaceListPath = path.join(homepath, "_postReplaceList.json");
    if (fs.existsSync(replaceListPath)) {
      try {
        const replisttext = fs.readFileSync(replaceListPath, "utf-8");
        const replist = JSON.parse(replisttext);
        if (!Array.isArray(replist)) throw new TypeError("置換リストのルートは配列である必要があります");
        for (let i = 0; i < replist.length; i++) {
          html = html.replace(new RegExp(replist[i].f, "g"), replist[i].r);
        }
      } catch (err) {
        throw new Error(`置換リストを読み込めません: ${replaceListPath} (${err.message})`);
      }
    }
    //連番処理〓文字を数値に置換
    //〓文字の数で連番の種類を分けられる
    let counter = 1;
    html = html.replace(/〓〓〓〓〓〓/g, function () {
      return counter++;
    });
    counter = 1;
    html = html.replace(/〓〓〓〓〓/g, function () {
      return counter++;
    });
    counter = 1;
    html = html.replace(/〓〓〓〓/g, function () {
      return counter++;
    });
    counter = 1;
    html = html.replace(/〓〓〓/g, function () {
      return counter++;
    });
    counter = 1;
    html = html.replace(/〓〓/g, function () {
      return counter++;
    });
    counter = 1;
    html = html.replace(/〓/g, function () {
      return counter++;
    });

    // lodashを使ってテンプレートにはめ込むの名残
    let finalhtmltext = html;

    // HEADERに目次用のIDを設定
    let $ = cheerio.load(finalhtmltext, {
      decodeEntities: true,
    });
    $("h1").each((i, elem) => {
      $(elem).attr("id", "h1_" + i);
    });
    $("h2").each((i, elem) => {
      $(elem).attr("id", "h2_" + i);
    });
    $("h3").each((i, elem) => {
      $(elem).attr("id", "h3_" + i);
    });
    $("h4").each((i, elem) => {
      $(elem).attr("id", "h4_" + i);
    });
    $("h5").each((i, elem) => {
      $(elem).attr("id", "h5_" + i);
    });
    $("h6").each((i, elem) => {
      $(elem).attr("id", "h6_" + i);
    });
    // $("title").text($("#pagetitle").text());

    // 行番号処理（VFM2.0に合わせて変更）
    $("h6.codenumber").each(function (i, elem) {
      // start-number属性があれば拾う
      let start_number = $(elem).attr("start-number");
      if (!start_number) {
        start_number = 1;
      }
      //   console.log(`start-number${start_number}`);
      $(elem)
        .next() // h6.codenumberの次にある要素（pre）を取得
        .find("code")
        .each(function (i, codeelem) {
          const content = $(codeelem).html();
          // console.log(content);
          if (content) {
            console.log("codenumbered!");
            let arr = content.split(/\r\n|\n/);
            let output = "";
            for (const s of arr) {
              output += '<span class="codenum-elem">' + ("000" + start_number).slice(-3) + "</span>" + s + "\n";
              start_number++;
            }
            // console.log(output);
            $(codeelem).html(output);
          }
        });
    });

    finalhtmltext = $.html();

    // postManiuplate処理
    const mnppath = path.join(homepath, "_postManipulate.json");
    console.log("check " + mnppath);
    if (fs.existsSync(mnppath) === true) {
      console.log(mnppath + " found");
      const mnptext = fs.readFileSync(mnppath, "utf-8");
      const mnplist = JSON.parse(mnptext);
      for (let i = 0; i < mnplist.length; i++) {
        // メソッドを実行
        switch (mnplist[i].method) {
          case "wrap":
            console.log("wrap");
            $(mnplist[i].selector).wrap($(mnplist[i].paramator));
            break;
          case "addClass":
            console.log("addClass");
            $(mnplist[i].selector).addClass(mnplist[i].paramator);
            break;
          case "wrapWithNextSib":
            console.log("wrapWithNextSib");
            $(mnplist[i].selector).each(function () {
              const section = $(this).add($(this).next());
              const newelem = $(this).before($(mnplist[i].paramator)).prev();
              newelem.append(section);
            });
            break;
          case "wrapAll":
            console.log("wrapAll");
            // selectorとparamator[0]が隣接した要素を探す
            $(mnplist[i].selector + "+" + mnplist[i].paramator[0]).each(function () {
              const newelem = $(this).before($(mnplist[i].paramator[1])).prev();
              console.log(mnplist[i].selector + "+" + mnplist[i].paramator[0]);
              const nextsiv = $(this).nextAll();
              newelem.append($(this));
              nextsiv.each(function () {
                console.log(this.tagName);
                if (this.tagName != mnplist[i].paramator[0]) return false;
                newelem.append($(this));
              });
            });
            break;
          case "dupRunning":
            console.log("dupRunning");
            $(mnplist[i].selector).each(function () {
              const text = $(this).text();
              const newelem = $(mnplist[i].paramator);
              newelem.text(text);
              $(this).append(newelem);
            });
            break;
        }
      }
      finalhtmltext = $.html();
    }

    // ファイルを書き出す
    try {
      //空のp要素の根絶
      console.log("空のp根絶！");
      finalhtmltext = finalhtmltext.replace(/<p>[\s\n]*<\/p>/gm, "");
      fs.writeFileSync(htmlfilepath, finalhtmltext);
    } catch (err) {
      throw new Error(`HTMLファイルを書き込めません: ${htmlfilepath} (${err.message})`);
    }

    return htmlfilepath;
  }

  // クエリ文字列（?svgimg=倍率,幅トリム,高さトリム,縦シフト,横シフト）SVG
  // 倍率以外は省略可
  static svgimg(mdtext, workdir) {
    const result = transformSvgImages(mdtext, workdir);
    if (result.diagnostics.length === 1) {
      vscode.window.showWarningMessage(`MDBP: svgimg — ${result.diagnostics[0].message}`);
    } else if (result.diagnostics.length > 1) {
      const details = result.diagnostics
        .slice(0, 3)
        .map((diagnostic) => diagnostic.message)
        .join(" / ");
      const omitted = result.diagnostics.length > 3 ? ` / ほか${result.diagnostics.length - 3}件` : "";
      vscode.window.showWarningMessage(`MDBP: svgimg — ${result.diagnostics.length}件の画像を変換できませんでした: ${details}${omitted}`);
    }
    return result.text;
  }

  // 現在Markdownファイルがある場所からさかのぼって，_postRelaceList.jsonの場所を探す
  static searchHomepath(mdpath, fname, workspaceRoot = path.dirname(mdpath)) {
    let currentPath = path.resolve(path.dirname(mdpath));
    let rootPath = path.resolve(workspaceRoot || currentPath);
    const relativeToRoot = path.relative(rootPath, currentPath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) rootPath = currentPath;

    while (true) {
      if (fs.existsSync(path.join(currentPath, fname))) return currentPath;
      if (currentPath === rootPath) return rootPath;

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) return rootPath;
      currentPath = parentPath;
    }
  }

  // 複数のMarkdownファイルをHTML変換する
  static convertByMarkdownList(workDirPath) {
    if (!workDirPath) throw new Error("変換対象のフォルダーを特定できません");
    const resolvedWorkDir = path.resolve(workDirPath);
    const listPath = path.join(resolvedWorkDir, "vivliostyle.mdbplist.json");
    if (!fs.existsSync(listPath)) throw new Error(`Markdownリストが見つかりません: ${listPath}`);

    try {
      const mdlisttext = fs.readFileSync(listPath, "utf-8");
      const mdlist = JSON.parse(mdlisttext);
      if (!Array.isArray(mdlist)) throw new TypeError("Markdownリストのルートは配列である必要があります");
      const convertedFiles = [];
      for (let i = 0; i < mdlist.length; i++) {
        if (typeof mdlist[i] !== "string") throw new TypeError(`Markdownリストの${i + 1}件目が文字列ではありません`);
        const mdpath = path.resolve(resolvedWorkDir, mdlist[i]).replace(/^[a-z]:/, (d) => d.toUpperCase());
        const homePath = MarkdownBookPreviewConvert.searchHomepath(mdpath, "_postReplaceList.json", resolvedWorkDir);
        const htmlfilepath = MarkdownBookPreviewConvert.convertMarkdown(mdpath, homePath);
        convertedFiles.push(htmlfilepath);
      }
      return convertedFiles;
    } catch (err) {
      throw new Error(`Markdownリストを変換できません: ${listPath} (${err.message})`);
    }
  }

  // InDesign用のXMLを書き出す
  static exportInDesignXML(htmlfile) {
    console.log("exportXML " + htmlfile);
    const workfolder = path.dirname(htmlfile);
    let html;
    try {
      html = fs.readFileSync(htmlfile, "utf-8");
    } catch (err) {
      throw new Error(`HTMLファイルを読み込めません: ${htmlfile} (${err.message})`);
    }

    const xmltext = convertHtmlToInDesignXml(html);
    const xmlfilepath = path.join(workfolder, path.basename(htmlfile, ".html")) + ".xml";
    console.log(xmlfilepath);

    // ファイル書き出し
    try {
      fs.writeFileSync(xmlfilepath, xmltext);
    } catch (err) {
      throw new Error(`XMLファイルを書き込めません: ${xmlfilepath} (${err.message})`);
    }

    return xmlfilepath;
  }
}

exports.MarkdownBookPreviewConvert = MarkdownBookPreviewConvert;
