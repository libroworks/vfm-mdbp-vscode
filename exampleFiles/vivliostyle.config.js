// @ts-check
const vivliostyleConfig = {
  entry: [
    // 目次の生成テスト
    { rel: 'contents', theme: '_css/fullpower.css' },
    // mdを指定するとMDBPの独自仕様部分と画像類が外れる
    'formattest.html',
    'formattest_copy.html'
  ], 
  toc: 'toc.html',
  tocTitle: '目次',
  output: [
    './merged_output.pdf',
  ],
};

module.exports = vivliostyleConfig;

