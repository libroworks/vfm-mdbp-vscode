# CLI単独変換の試作

`exampleFiles/formattest.md`の1章を、MDBP拡張機能を読み込まずに
Vivliostyle CLIの`documentProcessor`から変換します。
章の指定は`vivliostyle.config.js`の`entry`のみです。
既存のサンプル設定やHTMLは上書きしません。

## 実行

Node.js 22以上で、このディレクトリーから実行してください。

```sh
npm install
npm run build
```

この試作ではブラウザーを必要としないWeb Publication出力を使います。
変換HTMLは`output/workspace/formattest.html`、出版物は`output/webpub/`に生成されます。
`npm run preview`でプレビューできます。PDFを生成する場合は次のコマンドを使います。

```sh
npx vivliostyle build --config vivliostyle.config.js --output output/formattest.pdf
```

CLI 11.2.0（内蔵VFM 2.7.2）、cheerio 1.2.0、image-size 2.0.2を指定しています。
今回の検証ではインストール済みのCLI 11.2.0を利用しました。

## 比較検証

この試作フォルダーで依存パッケージをインストールし、ビルド後に実行します。

```sh
npm run verify
```

旧MDBP変換器は削除済みです。検証にもMDBPやVS Code APIを使用しません。

次の2つを文字列全体で比較し、SVG、見出しID、行番号の生成も確認します。

- カスタムプロセッサーを直接実行した結果
- 実際のCLIビルドで生成された`output/workspace/formattest.html`

移行前には旧変換器とのHTML完全一致も確認しました。現在の検証はCLI出力とプロセッサー出力の一致を確認するものです。

## 移植した処理と今後の範囲

svgimg、正規表現置換、連番、見出しID、コード行番号、DOM操作、空の段落除去を
現行の処理順で移植しています。HTML後処理とsvgimgは試作内にコピーしているため、
実行時に拡張機能の`lib/`を参照しません。

今回の1章では置換JSONの探索基準を`exampleFiles/`に固定しています。
`_postManipulate.json`の処理は移植していますが、このサンプルには該当ファイルがありません。
複数章・階層別JSON探索、画像やJSONの変更監視、CLI v8互換性、PDFの表示比較は未検証です。

設定生成メニュー、既存設定がある場合の生成中止、旧Markdownリスト機能の廃止、
拡張機能からのVFM依存削除は実装済みです。
