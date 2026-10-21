// packages/dsh-zhen/src/docx-parse.ts
import { inflateRawSync, crc32 } from "node:zlib";
import { SaxesParser } from "saxes";
var DOCX_LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, xmlBytes: 8 * 1024 * 1024, metadataBytes: 256 * 1024, textBytes: 2 * 1024 * 1024, entries: 512, depth: 128, timeoutMs: 3e4, heapMiB: 256, pending: 4 });
var WORD = /* @__PURE__ */ new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
var RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
var TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
var OFFICE = /* @__PURE__ */ new Set(["http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"]);
function refuse(code = "INVALID") {
  throw Error(code);
}
var utf8 = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
function partName(value) {
  const name = decodeURIComponent(value).replace(/^\//, "");
  if (!name || name.length > 1024 || /[\\\0?#:]/.test(name) || name.split("/").some((item) => !item || item === "." || item === "..")) refuse();
  return name;
}
function zipReader(input) {
  if (input.byteLength > DOCX_LIMITS.inputBytes) refuse("LIMIT");
  const b = Buffer.from(input);
  if (b.length < 22 || b.readUInt32LE(0) !== 67324752) refuse();
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 101010256 && i + 22 + b.readUInt16LE(i + 20) === b.length) {
    end = i;
    break;
  }
  if (end < 0) refuse();
  const count = b.readUInt16LE(end + 10), central = b.readUInt32LE(end + 16), length = b.readUInt32LE(end + 12);
  if (b.readUInt16LE(end + 4) || b.readUInt16LE(end + 6) || b.readUInt16LE(end + 8) !== count || !count || count > DOCX_LIMITS.entries || central + length !== end) refuse("LIMIT");
  const files = /* @__PURE__ */ new Map();
  let at = central;
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || b.readUInt32LE(at) !== 33639248) refuse();
    const names = b.readUInt16LE(at + 28), extra = b.readUInt16LE(at + 30), comment = b.readUInt16LE(at + 32);
    if (!names || at + 46 + names + extra + comment > end || b.readUInt16LE(at + 34)) refuse();
    const name = utf8(b.subarray(at + 46, at + 46 + names));
    if (name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.split("/").some((item) => item === "." || item === "..") || files.has(name)) refuse();
    files.set(name, { name, flags: b.readUInt16LE(at + 8), method: b.readUInt16LE(at + 10), crc: b.readUInt32LE(at + 16), compressed: b.readUInt32LE(at + 20), size: b.readUInt32LE(at + 24), offset: b.readUInt32LE(at + 42) });
    at += 46 + names + extra + comment;
  }
  if (at !== end) refuse();
  return (name, limit) => {
    const entry = files.get(name);
    if (!entry) refuse();
    const p = entry.offset;
    if (entry.flags & 65 || ![0, 8].includes(entry.method)) refuse("UNSUPPORTED");
    if (entry.size > limit || p + 30 > central || entry.compressed > DOCX_LIMITS.inputBytes) refuse("LIMIT");
    if (b.readUInt32LE(p) !== 67324752 || b.readUInt16LE(p + 6) !== entry.flags || b.readUInt16LE(p + 8) !== entry.method) refuse();
    const names = b.readUInt16LE(p + 26), extra = b.readUInt16LE(p + 28), start = p + 30 + names + extra;
    if (start > central || start + entry.compressed > central || utf8(b.subarray(p + 30, p + 30 + names)) !== name) refuse();
    const compressed = b.subarray(start, start + entry.compressed);
    let result;
    try {
      result = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: limit });
    } catch (error) {
      if (error.code === "ERR_BUFFER_TOO_LARGE") refuse("LIMIT");
      refuse();
    }
    if (result.length !== entry.size || crc32(result) !== entry.crc) refuse();
    return result;
  };
}
function xml(bytes, handlers) {
  let text;
  if (bytes[0] === 255 && bytes[1] === 254) text = new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
  else if (bytes[0] === 254 && bytes[1] === 255) text = new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  else text = utf8(bytes);
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0, events = 0;
  parser.on("error", () => refuse());
  parser.on("doctype", () => refuse("UNSUPPORTED"));
  parser.on("opentag", (tag) => {
    if (++depth > DOCX_LIMITS.depth || ++events > 5e5) refuse("LIMIT");
    handlers.open?.(tag, depth);
  });
  parser.on("closetag", (tag) => {
    handlers.close?.(tag, depth);
    depth--;
  });
  parser.on("text", (value) => handlers.text?.(value));
  parser.on("cdata", (value) => handlers.text?.(value));
  parser.write(text).close();
  if (depth !== 0) refuse();
}
var attr = (tag, name) => Object.values(tag.attributes).find((item) => item.local === name && !item.uri)?.value ?? "";
function parseDocx(input) {
  const read = zipReader(input);
  let main = "", relationsRoot = false;
  xml(read("_rels/.rels", DOCX_LIMITS.metadataBytes), { open(tag, depth) {
    if (depth === 1) {
      if (tag.uri !== RELS || tag.local !== "Relationships") refuse();
      relationsRoot = true;
    }
    if (depth === 2 && tag.uri === RELS && tag.local === "Relationship" && OFFICE.has(attr(tag, "Type"))) {
      if (main || attr(tag, "TargetMode").toLowerCase() === "external") refuse("UNSUPPORTED");
      main = partName(attr(tag, "Target"));
    }
  } });
  if (!relationsRoot || !main) refuse();
  let contentType = "", typesRoot = false;
  xml(read("[Content_Types].xml", DOCX_LIMITS.metadataBytes), { open(tag, depth) {
    if (depth === 1) {
      if (tag.uri !== TYPES || tag.local !== "Types") refuse();
      typesRoot = true;
    }
    if (depth === 2 && tag.uri === TYPES && tag.local === "Override" && partName(attr(tag, "PartName")) === main) {
      if (contentType) refuse();
      contentType = attr(tag, "ContentType");
    }
  } });
  if (!typesRoot || contentType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") refuse("UNSUPPORTED");
  let body = 0, bodies = 0, blocked = 0, textDepth = 0, run = 0, hidden = false, total = 0;
  const pieces = [];
  const append = (value) => {
    if (!value) return;
    total += Buffer.byteLength(value);
    if (total > DOCX_LIMITS.textBytes) refuse("TEXT_LIMIT");
    pieces.push(value);
  };
  xml(read(main, DOCX_LIMITS.xmlBytes), {
    open(tag, depth) {
      const word = WORD.has(tag.uri);
      if (depth === 1 && (!word || tag.local !== "document")) refuse();
      if (word && tag.local === "body") {
        if (++bodies !== 1 || depth !== 2) refuse();
        body = depth;
      }
      if (!body || blocked) return;
      if (word && ["del", "moveFrom", "drawing", "pict", "object"].includes(tag.local)) {
        blocked = depth;
        return;
      }
      if (!word) return;
      if (["altChunk", "subDoc"].includes(tag.local)) refuse("UNSUPPORTED");
      if (tag.local === "r") {
        run = depth;
        hidden = false;
      }
      if (tag.local === "vanish" && run) {
        const value = Object.values(tag.attributes).find((item) => WORD.has(item.uri) && item.local === "val")?.value;
        hidden = !["0", "false", "off"].includes(value ?? "");
      }
      if (tag.local === "t" && !hidden) textDepth = depth;
      if (!hidden && tag.local === "tab") append("	");
      if (!hidden && ["br", "cr"].includes(tag.local)) append("\n");
    },
    text(value) {
      if (body && textDepth && !blocked && !hidden) append(value);
    },
    close(tag, depth) {
      if (blocked) {
        if (depth === blocked) blocked = 0;
        return;
      }
      if (!body) return;
      const word = WORD.has(tag.uri);
      if (depth === textDepth) textDepth = 0;
      if (depth === run) {
        run = 0;
        hidden = false;
      }
      if (word && tag.local === "p") append("\n");
      if (word && tag.local === "tc") append("	");
      if (word && tag.local === "tr") append("\n");
      if (depth === body) body = 0;
    }
  });
  if (bodies !== 1) refuse();
  return pieces.join("").replace(/\n\t/g, "	").replace(/\t\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// packages/dsh-zhen/src/docx-text-worker.ts
if (!process.connected) process.exit(1);
process.once("disconnect", () => process.exit(1));
process.once("message", (input) => {
  let output = { ok: false, code: "INVALID" };
  try {
    if (!input || typeof input !== "object" || !("bytes" in input) || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength > DOCX_LIMITS.inputBytes) throw Error("INVALID");
    globalThis.fetch = async () => {
      throw Error("NETWORK_DISABLED");
    };
    output = { ok: true, text: parseDocx(input.bytes) };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    output = { ok: false, code: ["LIMIT", "TEXT_LIMIT", "UNSUPPORTED"].includes(code) ? code : "INVALID" };
  }
  if (process.send) process.send(output, () => process.exit(0));
  else process.exit(1);
});
