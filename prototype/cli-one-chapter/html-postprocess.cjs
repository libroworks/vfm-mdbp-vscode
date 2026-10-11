const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

function postprocessHtml(html, homepath) {
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
      $(elem)
        .next() // h6.codenumberの次にある要素（pre）を取得
        .find("code")
        .each(function (i, codeelem) {
          const content = $(codeelem).html();
          if (content) {
            let arr = content.split(/\r\n|\n/);
            let output = "";
            for (const s of arr) {
              output += '<span class="codenum-elem">' + ("000" + start_number).slice(-3) + "</span>" + s + "\n";
              start_number++;
            }
            $(codeelem).html(output);
          }
        });
    });

    finalhtmltext = $.html();

    // postManiuplate処理
    const mnppath = path.join(homepath, "_postManipulate.json");
    if (fs.existsSync(mnppath) === true) {
      const mnptext = fs.readFileSync(mnppath, "utf-8");
      const mnplist = JSON.parse(mnptext);
      for (let i = 0; i < mnplist.length; i++) {
        // メソッドを実行
        switch (mnplist[i].method) {
          case "wrap":
            $(mnplist[i].selector).wrap($(mnplist[i].paramator));
            break;
          case "addClass":
            $(mnplist[i].selector).addClass(mnplist[i].paramator);
            break;
          case "wrapWithNextSib":
            $(mnplist[i].selector).each(function () {
              const section = $(this).add($(this).next());
              const newelem = $(this).before($(mnplist[i].paramator)).prev();
              newelem.append(section);
            });
            break;
          case "wrapAll":
            // selectorとparamator[0]が隣接した要素を探す
            $(mnplist[i].selector + "+" + mnplist[i].paramator[0]).each(function () {
              const newelem = $(this).before($(mnplist[i].paramator[1])).prev();
              const nextsiv = $(this).nextAll();
              newelem.append($(this));
              nextsiv.each(function () {
                if (this.tagName != mnplist[i].paramator[0]) return false;
                newelem.append($(this));
              });
            });
            break;
          case "dupRunning":
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

    return finalhtmltext.replace(/<p>[\s\n]*<\/p>/gm, "");
}
module.exports = { postprocessHtml };
