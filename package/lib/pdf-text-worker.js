// packages/dsh-zhen/src/pdf-text-worker.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// packages/dsh-zhen/src/pdf-text.ts
var PDF_TEXT_LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, textBytes: 2 * 1024 * 1024, pages: 200, timeoutMs: 3e4, heapMiB: 256, pending: 4 });
var tail = Promise.resolve();

// packages/dsh-zhen/src/pdf-text-worker.ts
if (!process.connected) process.exit(1);
process.once("disconnect", () => process.exit(1));
process.once("message", async (input) => {
  let output = { ok: false };
  try {
    if (!input || typeof input !== "object" || !("bytes" in input) || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength > PDF_TEXT_LIMITS.inputBytes) throw Error();
    let networkRequests = 0;
    globalThis.fetch = async () => {
      networkRequests++;
      throw Error("PDF_NETWORK_DISABLED");
    };
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), root = new URL("./cmaps/", import.meta.resolve("pdfjs-dist/package.json"));
    class LocalCMaps {
      async fetch({ kind, filename }) {
        if (kind !== "cMapUrl" || !/^[A-Za-z0-9_-]+\.bcmap$/.test(filename)) throw Error("PDF_RESOURCE_REFUSED");
        return new Uint8Array(await readFile(new URL(filename, root)));
      }
    }
    const task = getDocument({ data: new Uint8Array(input.bytes), verbosity: 0, cMapUrl: fileURLToPath(root).replaceAll("\\", "/"), cMapPacked: true, BinaryDataFactory: LocalCMaps, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, useWasm: false, enableXfa: false, stopAtErrors: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, maxImageSize: 0 });
    try {
      const pdf = await task.promise;
      if (pdf.numPages < 1 || pdf.numPages > PDF_TEXT_LIMITS.pages) throw Error("PDF_PAGE_LIMIT");
      const pages = [];
      let total = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number), reader = page.streamTextContent().getReader();
        let text = "";
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            for (const item of next.value.items) {
              if (!("str" in item)) continue;
              const part = item.str + (item.hasEOL ? "\n" : "");
              total += Buffer.byteLength(part);
              if (total > PDF_TEXT_LIMITS.textBytes || part.includes("\0")) throw Error("PDF_TEXT_LIMIT");
              text += part;
            }
          }
        } finally {
          await reader.cancel().catch(() => {
          });
          reader.releaseLock();
          page.cleanup();
        }
        if (text.trim()) pages.push({ page: number, text });
      }
      if (networkRequests) throw Error("PDF_NETWORK_DISABLED");
      output = { ok: true, pageCount: pdf.numPages, pages };
    } finally {
      await task.destroy();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "", name = error instanceof Error ? error.name : "";
    output = { ok: false, code: message === "PDF_TEXT_LIMIT" ? "TEXT_LIMIT" : message === "PDF_PAGE_LIMIT" ? "PAGE_LIMIT" : name === "PasswordException" ? "PASSWORD" : "UNREADABLE" };
  }
  if (process.send) process.send(output, () => process.exit(0));
  else process.exit(1);
});
