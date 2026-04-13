import {
  DOMMatrix,
  ImageData,
  Path2D,
  createCanvas,
} from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ObjectStoreRuntimeContext } from './objectStore.js';

export interface ExtractedPdfPage {
  pageNo: number;
  objectKey: string;
  contentType: string;
}

export interface RenderedPdfPage {
  pageNo: number;
  bytes: Uint8Array;
  contentType: string;
}

export interface PdfPageExtractor {
  extractPages(input: {
    answerPdfObjectKey: string;
    outputPrefix: string;
    runtime?: ObjectStoreRuntimeContext;
  }): Promise<ExtractedPdfPage[]>;
}

interface ObjectStoreWithBytes {
  getObjectBytes: (
    objectKey: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<Uint8Array>;
  saveObject: (
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<void>;
}

type RenderPdfPages = (pdfBytes: Uint8Array) => Promise<RenderedPdfPage[]>;

if (!('DOMMatrix' in globalThis)) {
  Object.assign(globalThis, { DOMMatrix });
}
if (!('ImageData' in globalThis)) {
  Object.assign(globalThis, { ImageData });
}
if (!('Path2D' in globalThis)) {
  Object.assign(globalThis, { Path2D });
}

async function renderPdfPagesWithPdfJs(
  pdfBytes: Uint8Array
): Promise<RenderedPdfPage[]> {
  const loadingTask = getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const renderedPages: RenderedPdfPage[] = [];

  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );
      const context = canvas.getContext('2d');

      await page.render({
        canvasContext: context as never,
        viewport,
      }).promise;

      renderedPages.push({
        pageNo,
        bytes: new Uint8Array(canvas.toBuffer('image/png')),
        contentType: 'image/png',
      });

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return renderedPages;
}

export function createPdfPageExtractor({
  objectStore,
  renderPdfPages = renderPdfPagesWithPdfJs,
}: {
  objectStore: ObjectStoreWithBytes;
  renderPdfPages?: RenderPdfPages;
}): PdfPageExtractor {
  return {
    async extractPages({ answerPdfObjectKey, outputPrefix, runtime }) {
      const pdfBytes = await objectStore.getObjectBytes(
        answerPdfObjectKey,
        runtime
      );
      const renderedPages = await renderPdfPages(pdfBytes);

      const savedPages: ExtractedPdfPage[] = [];

      for (const page of renderedPages) {
        const objectKey = `${outputPrefix}/page-${page.pageNo}.png`;
        await objectStore.saveObject(
          objectKey,
          page.bytes,
          page.contentType,
          runtime
        );
        savedPages.push({
          pageNo: page.pageNo,
          objectKey,
          contentType: page.contentType,
        });
      }

      return savedPages;
    },
  };
}
