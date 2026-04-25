import {
  DOMMatrix,
  ImageData,
  Path2D,
  createCanvas,
} from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorkerModule from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import type { ObjectStoreRuntimeContext } from './objectStore.js';

const globalWithPdfJsWorker = globalThis as typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: unknown;
  };
};

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
  countPages?: (input: {
    answerPdfObjectKey: string;
    runtime?: ObjectStoreRuntimeContext;
  }) => Promise<number>;
  extractPages(input: {
    answerPdfObjectKey: string;
    outputPrefix: string;
    pageNos?: number[];
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

type StreamRenderedPage = (page: RenderedPdfPage) => Promise<void>;

interface RenderPdfPagesInput {
  pdfBytes: Uint8Array;
  pageNos?: number[];
  onPage: StreamRenderedPage;
}

type RenderPdfPages = (input: RenderPdfPagesInput) => Promise<void>;

if (!('DOMMatrix' in globalThis)) {
  Object.assign(globalThis, { DOMMatrix });
}
if (!('ImageData' in globalThis)) {
  Object.assign(globalThis, { ImageData });
}
if (!('Path2D' in globalThis)) {
  Object.assign(globalThis, { Path2D });
}
if (!globalWithPdfJsWorker.pdfjsWorker) {
  Object.assign(globalWithPdfJsWorker, {
    pdfjsWorker: {
      WorkerMessageHandler: pdfjsWorkerModule.WorkerMessageHandler,
    },
  });
}

async function renderPdfPagesWithPdfJs(
  input: RenderPdfPagesInput
): Promise<void> {
  const loadingTask = getDocument({
    data: input.pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  try {
    const requestedPageNos =
      input.pageNos?.length
        ? [...new Set(input.pageNos)]
            .filter((pageNo) => pageNo >= 1 && pageNo <= pdf.numPages)
            .sort((left, right) => left - right)
        : Array.from({ length: pdf.numPages }, (_, index) => index + 1);

    for (const pageNo of requestedPageNos) {
      const page = await pdf.getPage(pageNo);
      try {
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

        await input.onPage({
          pageNo,
          bytes: new Uint8Array(canvas.toBuffer('image/png')),
          contentType: 'image/png',
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }
}

async function countPdfPagesWithPdfJs(pdfBytes: Uint8Array): Promise<number> {
  const loadingTask = getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  try {
    return pdf.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

function resolvePageExtension(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized === 'image/png') {
    return 'png';
  }
  if (normalized === 'image/jpeg') {
    return 'jpg';
  }
  if (normalized === 'image/webp') {
    return 'webp';
  }

  throw new Error(`暂不支持的页面图片类型: ${contentType}`);
}

export function createPdfPageExtractor({
  objectStore,
  renderPdfPages = renderPdfPagesWithPdfJs,
  countPdfPages = countPdfPagesWithPdfJs,
}: {
  objectStore: ObjectStoreWithBytes;
  renderPdfPages?: RenderPdfPages;
  countPdfPages?: (pdfBytes: Uint8Array) => Promise<number>;
}): PdfPageExtractor {
  return {
    async countPages({ answerPdfObjectKey, runtime }) {
      const pdfBytes = await objectStore.getObjectBytes(
        answerPdfObjectKey,
        runtime
      );

      return countPdfPages(pdfBytes);
    },
    async extractPages({ answerPdfObjectKey, outputPrefix, pageNos, runtime }) {
      const pdfBytes = await objectStore.getObjectBytes(
        answerPdfObjectKey,
        runtime
      );
      const savedPages: ExtractedPdfPage[] = [];
      await renderPdfPages({
        pdfBytes,
        pageNos,
        onPage: async (page) => {
          const extension = resolvePageExtension(page.contentType);
          const objectKey = `${outputPrefix}/page-${page.pageNo}.${extension}`;
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
        },
      });

      return savedPages;
    },
  };
}
