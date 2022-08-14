// @ts-check
const vivliostyleConfig = {
  entry: [
    // mdを指定するとMDBPの独自仕様部分と画像類が外れる
    'formattest.html',
    'formattest_copy.html'
  ], 
  output: [
    './merged_output.pdf',
  ],
};

module.exports = vivliostyleConfig;

