import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdfPageExtractor } from './pdfPageExtractor.js';

afterEach(() => {
  vi.resetModules();
  vi.unmock('pdfjs-dist/legacy/build/pdf.mjs');
  vi.unmock('pdfjs-dist/legacy/build/pdf.worker.mjs');
  vi.unmock('@napi-rs/canvas');
  Reflect.deleteProperty(
    globalThis as typeof globalThis & { pdfjsWorker?: unknown },
    'pdfjsWorker'
  );
});

describe('createPdfPageExtractor', () => {
  it('counts PDF pages without rendering page images', async () => {
    const objectStore = {
      getObjectBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      saveObject: vi.fn(async () => undefined),
    };
    const extractor = createPdfPageExtractor({
      objectStore: objectStore as never,
      countPdfPages: vi.fn(async () => 6),
    });

    const result = await extractor.countPages!({
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
    });

    expect(result).toBe(6);
    expect(objectStore.saveObject).not.toHaveBeenCalled();
  });

  it('renders a PDF object into per-page image objects', async () => {
    const objectStore = {
      getObjectBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      saveObject: vi.fn(async () => undefined),
    };
    const extractor = createPdfPageExtractor({
      objectStore: objectStore as never,
      renderPdfPages: async ({ onPage }) => {
        await onPage({
          pageNo: 1,
          bytes: new Uint8Array([9]),
          contentType: 'image/png',
        });
      },
    });

    const result = await extractor.extractPages({
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      outputPrefix: 'derived/batch/task-1',
    });

    expect(result).toEqual([
      {
        pageNo: 1,
        objectKey: 'derived/batch/task-1/page-1.png',
        contentType: 'image/png',
      },
    ]);
    expect(objectStore.getObjectBytes).toHaveBeenCalledWith(
      'uploads/batch/answers.pdf',
      undefined
    );
    expect(objectStore.saveObject).toHaveBeenCalledWith(
      'derived/batch/task-1/page-1.png',
      new Uint8Array([9]),
      'image/png',
      undefined
    );
  });

  it('renders only the requested PDF pages', async () => {
    const objectStore = {
      getObjectBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      saveObject: vi.fn(async () => undefined),
    };
    const extractor = createPdfPageExtractor({
      objectStore: objectStore as never,
      renderPdfPages: async ({ onPage, pageNos }) => {
        expect(pageNos).toEqual([2, 4]);

        await onPage({
          pageNo: 2,
          bytes: new Uint8Array([2]),
          contentType: 'image/png',
        });
        await onPage({
          pageNo: 4,
          bytes: new Uint8Array([4]),
          contentType: 'image/png',
        });
      },
    });

    const result = await extractor.extractPages({
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      outputPrefix: 'derived/batch/task-2',
      pageNos: [2, 4],
    });

    expect(result).toEqual([
      {
        pageNo: 2,
        objectKey: 'derived/batch/task-2/page-2.png',
        contentType: 'image/png',
      },
      {
        pageNo: 4,
        objectKey: 'derived/batch/task-2/page-4.png',
        contentType: 'image/png',
      },
    ]);
  });

  it('registers the pdfjs worker handler globally for server runtimes', async () => {
    const workerMessageHandler = { setup: vi.fn() };

    vi.doMock('@napi-rs/canvas', () => ({
      DOMMatrix: class DOMMatrix {},
      ImageData: class ImageData {},
      Path2D: class Path2D {},
      createCanvas: vi.fn(),
    }));
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument: vi.fn(),
    }));
    vi.doMock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({
      WorkerMessageHandler: workerMessageHandler,
    }));

    await import('./pdfPageExtractor.js');

    expect(
      (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker
    ).toEqual({
      WorkerMessageHandler: workerMessageHandler,
    });
  });
});
