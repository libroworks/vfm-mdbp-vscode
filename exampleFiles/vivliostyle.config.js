// @ts-check
module.exports = {
  entry: [
    // mdを指定するとMDBPの独自仕様部分と画像類が外れる
    "formattest.html",
    "formattest2.html",
  ],
  output: ["./merged_output.pdf"],
};
