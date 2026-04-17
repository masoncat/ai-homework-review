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

type StreamRenderedPage = (page: RenderedPdfPage) => Promise<void>;

interface RenderPdfPagesInput {
  pdfBytes: Uint8Array;
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
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
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
      const savedPages: ExtractedPdfPage[] = [];
      await renderPdfPages({
        pdfBytes,
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
