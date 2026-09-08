const cheerio = require("cheerio");

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const STORY_ELEMENT =
  '<story xmlns:aid5="http://ns.adobe.com/AdobeInDesign/5.0/" ' +
  'xmlns:aid="http://ns.adobe.com/AdobeInDesign/4.0/"></story>';
const WHITESPACE_PRESERVING_ELEMENTS = new Set(["pre", "code"]);
const BLOCK_CONTAINERS = new Set([
  "body",
  "div",
  "figure",
  "html",
  "ol",
  "section",
  "story",
  "table",
  "tbody",
  "thead",
  "tr",
  "ul",
]);
const PARAGRAPH_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p"]);
const INDESIGN_PARAGRAPH_ELEMENTS = new Set([...PARAGRAPH_ELEMENTS, "dd", "dt", "figcaption", "li", "pre"]);

/**
 * Convert an HTML document to the XML format imported by InDesign.
 *
 * This function has no filesystem or VS Code dependencies so that conversion
 * behavior can be covered by ordinary unit tests.
 *
 * @param {string} html
 * @returns {string}
 */
function convertHtmlToInDesignXml(html) {
  const $html = cheerio.load(html, { decodeEntities: true });
  const $xml = cheerio.load(XML_DECLARATION + STORY_ELEMENT, {
    xmlMode: true,
    decodeEntities: true,
  });
  const story = $xml("story").get(0);
  const htmlBody = $html("body").get(0);
  let hasDocumentContent = false;
  let lastOutputWasLineBreak = false;

  if (!htmlBody) {
    throw new Error("HTML document does not contain a body element.");
  }

  $xml(story).append("<body></body>");
  const xmlBody = $xml(story).children("body").get(0);
  appendChildren(htmlBody, xmlBody, false);
  return $xml.xml();

  function appendChildren(htmlParent, xmlParent, preserveWhitespace) {
    for (const child of $html(htmlParent).contents().toArray()) {
      appendNode(child, xmlParent, preserveWhitespace);
    }
  }

  function appendNode(htmlNode, xmlParent, preserveWhitespace) {
    if (htmlNode.type === "text") {
      appendText(htmlNode.data || "", htmlNode.parent, xmlParent, preserveWhitespace);
      return;
    }

    if (htmlNode.type !== "tag") return;

    const sourceName = htmlNode.tagName;
    const childPreservesWhitespace = preserveWhitespace || WHITESPACE_PRESERVING_ELEMENTS.has(sourceName);

    // These HTML grouping elements are not part of the InDesign XML schema.
    if (sourceName === "thead" || sourceName === "tbody") {
      appendChildren(htmlNode, xmlParent, childPreservesWhitespace);
      return;
    }

    // A line break is document content, not an XML formatting newline.
    if (sourceName === "br") {
      appendTextNode(xmlParent, "\n");
      return;
    }

    // InDesign determines paragraphs from line breaks in the imported text
    // stream. Add one logical separator before paragraph-level elements,
    // independently from indentation used to format the source HTML/XML.
    if (INDESIGN_PARAGRAPH_ELEMENTS.has(sourceName) && hasDocumentContent && !lastOutputWasLineBreak) {
      appendTextNode(xmlParent, "\n");
    }

    const xmlName = getXmlElementName(htmlNode);
    $xml(xmlParent).append(`<${xmlName}></${xmlName}>`);
    const children = $xml(xmlParent).children(xmlName).toArray();
    const xmlNode = children[children.length - 1];

    copyImageAttributes(htmlNode, xmlNode);

    if (sourceName === "img" || sourceName === "image" || sourceName === "hr") {
      hasDocumentContent = true;
      lastOutputWasLineBreak = false;
    }

    // Images are always represented by an empty XML element.
    if (sourceName !== "img" && sourceName !== "image") {
      appendChildren(htmlNode, xmlNode, childPreservesWhitespace);
    }
  }

  function appendText(text, htmlParent, xmlParent, preserveWhitespace) {
    if (preserveWhitespace) {
      appendTextNode(xmlParent, text);
      return;
    }

    if (!/^\s+$/.test(text) || !/[\r\n]/.test(text)) {
      appendTextNode(xmlParent, text);
      return;
    }

    // Newlines between block elements are serializer indentation. Within
    // phrasing content, HTML collapses them to one visible space.
    if (htmlParent && !BLOCK_CONTAINERS.has(htmlParent.tagName)) {
      appendTextNode(xmlParent, " ");
    }
  }

  function appendTextNode(xmlParent, text) {
    if (text.length === 0) return;
    $xml(xmlParent).append({
      type: "text",
      data: text,
      parent: null,
      prev: null,
      next: null,
    });
    hasDocumentContent = true;
    lastOutputWasLineBreak = /[\r\n]$/.test(text);
  }

  function getXmlElementName(htmlNode) {
    const sourceName = htmlNode.tagName;
    let name = sourceName === "image" ? "img" : sourceName === "th" ? "td" : sourceName;
    let className = $html(htmlNode).attr("class");

    if (PARAGRAPH_ELEMENTS.has(sourceName) && !className) {
      className = $html(htmlNode.parentNode).attr("class");
    }

    if (sourceName === "li") {
      let parent = htmlNode.parentNode;
      name = `${parent.tagName}_${name}`;
      for (let i = 0; i < 3 && parent && !className; i++) {
        className = $html(parent).attr("class");
        parent = parent.parentNode;
      }
    }

    return className ? `${name}_${className.replace(/ /g, "_")}` : name;
  }

  function copyImageAttributes(htmlNode, xmlNode) {
    if (htmlNode.tagName === "img") {
      $xml(xmlNode).attr("href", `file://${$html(htmlNode).attr("src")}`);
      return;
    }

    if (htmlNode.tagName !== "image") return;

    const image = $html(htmlNode);
    $xml(xmlNode).attr("href", `file://${image.attr("href") || image.attr("xlink:href")}`);

    const transform = image.attr("transform") || "";
    const match = transform.match(/translate\(([^,]*),([^)]*)\)\s+scale\(([^)]+)\)/);
    if (match) {
      $xml(xmlNode).attr("translate-x", match[1]);
      $xml(xmlNode).attr("translate-y", match[2]);
      $xml(xmlNode).attr("scale", match[3]);
    }

    const parent = htmlNode.parentNode;
    if (parent && parent.tagName === "svg") {
      $xml(xmlNode).attr("width", $html(parent).attr("width"));
      $xml(xmlNode).attr("height", $html(parent).attr("height"));
    }
  }
}

module.exports = { convertHtmlToInDesignXml };
