const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");

const DEFAULT_DENSITY_DPI = 72;
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_EXTENSIONS = new Set([".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"]);

/**
 * Convert Markdown images containing ?svgimg= into inline SVG.
 * Failed images are left unchanged and reported as diagnostics.
 *
 * @param {string} markdown
 * @param {string} workdir
 * @param {object} [options]
 * @returns {{ text: string, diagnostics: Array<{code: string, message: string, source: string, imagePath?: string}> }}
 */
function transformSvgImages(markdown, workdir, options = {}) {
  const densityDpi = options.densityDpi ?? DEFAULT_DENSITY_DPI;
  const maxFileSize = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  const supportedExtensions = options.supportedExtensions ?? DEFAULT_EXTENSIONS;
  const fileSystem = options.fileSystem ?? fs;
  const measureImage = options.measureImage ?? imageSize;
  const diagnostics = [];
  const protectedRanges = findCodeRanges(markdown);
  const replacements = [];

  if (!Number.isFinite(densityDpi) || densityDpi <= 0) {
    throw new TypeError("densityDpi must be a positive number.");
  }

  for (const image of findMarkdownImages(markdown)) {
    if (isProtected(image.start, protectedRanges)) continue;

    const svgimgIndex = image.destination.indexOf("?svgimg=");
    if (svgimgIndex < 0) continue;

    const sourcePath = image.destination.slice(0, svgimgIndex);
    const rawParameters = image.destination.slice(svgimgIndex + "?svgimg=".length).split(/[&#]/, 1)[0];
    const parameters = parseParameters(rawParameters);
    if (!parameters.ok) {
      report("INVALID_PARAMETERS", parameters.message, image.source);
      continue;
    }

    const normalizedPath = normalizeImagePath(sourcePath);
    if (!normalizedPath.ok) {
      report("INVALID_PATH", normalizedPath.message, image.source);
      continue;
    }

    const absolutePath = path.isAbsolute(normalizedPath.value)
      ? path.normalize(normalizedPath.value)
      : path.resolve(workdir, normalizedPath.value);
    const extension = path.extname(absolutePath).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      report("UNSUPPORTED_FORMAT", `対応していない画像形式です: ${sourcePath}`, image.source, absolutePath);
      continue;
    }

    let dimensions;
    try {
      const stat = fileSystem.statSync(absolutePath);
      if (!stat.isFile()) throw new Error("画像パスがファイルではありません");
      if (stat.size > maxFileSize) throw new Error(`画像ファイルが大きすぎます（上限${formatMegabytes(maxFileSize)}MB）`);
      dimensions = measureImage(fileSystem.readFileSync(absolutePath));
    } catch (error) {
      report("IMAGE_READ_FAILED", `画像を読み取れません: ${sourcePath} (${error.message})`, image.source, absolutePath);
      continue;
    }

    if (!isPositiveNumber(dimensions.width) || !isPositiveNumber(dimensions.height)) {
      report("INVALID_DIMENSIONS", `画像サイズが不正です: ${sourcePath}`, image.source, absolutePath);
      continue;
    }

    replacements.push({
      start: image.start,
      end: image.end,
      value: createSvg(normalizedPath.value, dimensions, parameters.value, densityDpi),
    });
  }

  let text = markdown;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i];
    text = text.slice(0, replacement.start) + replacement.value + text.slice(replacement.end);
  }

  return { text, diagnostics };

  function report(code, message, source, imagePath) {
    diagnostics.push({ code, message, source, ...(imagePath ? { imagePath } : {}) });
  }
}

function parseParameters(rawParameters) {
  const values = rawParameters.split(",");
  if (values.length > 5 || values[0].trim() === "") {
    return invalid("svgimgには倍率と最大4個の追加パラメーターを指定してください");
  }

  const parsed = values.map((value, index) => {
    if (value.trim() === "" && index > 0) return 0;
    return Number(value.trim());
  });

  if (parsed.some((value) => !Number.isFinite(value))) return invalid("svgimgのパラメーターは数値で指定してください");
  if (parsed[0] <= 0) return invalid("svgimgの倍率は0より大きい値を指定してください");
  if ((parsed[1] ?? 0) < 0 || (parsed[2] ?? 0) < 0) return invalid("svgimgの幅と高さには0以上の値を指定してください");

  return {
    ok: true,
    value: {
      scale: parsed[0] / 100,
      trimWidth: parsed[1] ?? 0,
      trimHeight: parsed[2] ?? 0,
      shiftX: parsed[3] ?? 0,
      shiftY: parsed[4] ?? 0,
    },
  };
}

function normalizeImagePath(sourcePath) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(sourcePath) && !/^[a-z]:[\\/]/i.test(sourcePath)) {
    return invalid(`ローカル画像以外はsvgimgで処理できません: ${sourcePath}`);
  }

  const unescaped = sourcePath.replace(/\\([!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-])/g, "$1");
  try {
    return { ok: true, value: decodeURIComponent(unescaped) };
  } catch {
    return invalid(`画像パスのURLエンコードが不正です: ${sourcePath}`);
  }
}

function createSvg(sourcePath, dimensions, parameters, densityDpi) {
  const dpiToMillimeters = 25.4 / densityDpi;
  const printWidth = round(dimensions.width * dpiToMillimeters);
  const printHeight = round(dimensions.height * dpiToMillimeters);
  const scale = round(parameters.scale);
  const scaledWidth = round(printWidth * scale);
  const scaledHeight = round(printHeight * scale);
  const trimWidth = parameters.trimWidth === 0 ? scaledWidth : round(parameters.trimWidth);
  const trimHeight = parameters.trimHeight === 0 ? scaledHeight : round(parameters.trimHeight);
  const shiftX = round(parameters.shiftX);
  const shiftY = round(parameters.shiftY);
  const href = escapeAttribute(sourcePath.replace(/\\/g, "/"));

  return (
    `<svg width="${trimWidth}mm" height="${trimHeight}mm" viewBox="0 0 ${trimWidth} ${trimHeight}">\n` +
    `<image width="${printWidth}" height="${printHeight}" xlink:href="${href}" ` +
    `transform="translate(${shiftX},${shiftY}) scale(${scale})"/>\n` +
    "</svg>\n"
  );
}

function findMarkdownImages(markdown) {
  const images = [];
  let cursor = 0;
  while ((cursor = markdown.indexOf("![", cursor)) >= 0) {
    if (isEscaped(markdown, cursor)) {
      cursor += 2;
      continue;
    }

    const altEnd = findClosingBracket(markdown, cursor + 2, "[", "]", false);
    if (altEnd < 0 || markdown[altEnd + 1] !== "(") {
      cursor += 2;
      continue;
    }

    const destinationEnd = findClosingBracket(markdown, altEnd + 2, "(", ")", true);
    if (destinationEnd < 0) break;

    const content = markdown.slice(altEnd + 2, destinationEnd).trim();
    const destination = readDestination(content);
    if (destination) {
      images.push({
        start: cursor,
        end: destinationEnd + 1,
        source: markdown.slice(cursor, destinationEnd + 1),
        destination,
      });
    }
    cursor = destinationEnd + 1;
  }
  return images;
}

function readDestination(content) {
  if (content.startsWith("<")) {
    const closing = content.indexOf(">");
    return closing > 0 ? content.slice(1, closing) : null;
  }

  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    if (isEscaped(content, i)) continue;
    if (content[i] === "(") depth++;
    else if (content[i] === ")" && depth > 0) depth--;
    else if (/\s/.test(content[i]) && depth === 0) return content.slice(0, i);
  }
  return content;
}

function findClosingBracket(text, start, opening, closing, respectQuotes) {
  let depth = 1;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    if (isEscaped(text, i)) continue;
    const character = text[i];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (respectQuotes && (character === '"' || character === "'") && /\s/.test(text[i - 1] || "")) {
      quote = character;
      continue;
    }
    if (character === opening) depth++;
    if (character === closing && --depth === 0) return i;
  }
  return -1;
}

function findCodeRanges(markdown) {
  const ranges = [];
  const lines = markdown.match(/.*(?:\r\n|\n|$)/g) || [];
  let offset = 0;
  let fence = null;
  let fenceStart = 0;

  for (const line of lines) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence && match) {
      fence = { character: match[1][0], length: match[1].length };
      fenceStart = offset;
    } else if (fence && new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`).test(line.trimEnd())) {
      ranges.push([fenceStart, offset + line.length]);
      fence = null;
    } else if (!fence) {
      ranges.push(...findInlineCodeRanges(line, offset));
    }
    offset += line.length;
  }
  if (fence) ranges.push([fenceStart, markdown.length]);
  return ranges;
}

function findInlineCodeRanges(line, offset) {
  const ranges = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "`" || isEscaped(line, i)) continue;
    const start = i;
    while (line[i + 1] === "`") i++;
    const marker = line.slice(start, i + 1);
    const end = line.indexOf(marker, i + 1);
    if (end < 0) break;
    ranges.push([offset + start, offset + end + marker.length]);
    i = end + marker.length - 1;
  }
  return ranges;
}

function isProtected(position, ranges) {
  return ranges.some(([start, end]) => position >= start && position < end);
}

function isEscaped(text, position) {
  let slashes = 0;
  for (let i = position - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function formatMegabytes(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function invalid(message) {
  return { ok: false, message };
}

module.exports = { transformSvgImages };
