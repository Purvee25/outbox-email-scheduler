import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "a",
];
const ALLOWED_LINK_SCHEMES = ["http", "https", "mailto"];
const TEXT_ALIGN = /^(left|right|center|justify)$/;
const HAS_MARKUP = /<\/?[a-z][^>]*>/i;
const BLOCK_END = /<\/(p|li|h[1-3]|blockquote)>|<br\s*\/?>/gi;

/** Strips everything except basic formatting; links are limited to http(s)/mailto. */
export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: { "*": { "text-align": [TEXT_ALIGN] } },
    allowedSchemes: ALLOWED_LINK_SCHEMES,
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}

/** Plain-text rendition (used for the text/plain alternative, search and previews). */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(BLOCK_END, (match) => `${match}\n`);
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Bodies saved before rich text existed are plain text: escape them and keep line breaks.
 * Everything is sanitised again on the way out, so stored HTML is never trusted.
 */
export function toSafeHtml(body: string): string {
  if (HAS_MARKUP.test(body)) return sanitizeBody(body);
  const escaped = sanitizeHtml(body, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
}
