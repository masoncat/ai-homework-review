import { describe, expect, it, vi } from 'vitest';
import { createPdfPageExtractor } from './pdfPageExtractor.js';

describe('createPdfPageExtractor', () => {
  it('renders a PDF object into per-page image objects', async () => {
    const objectStore = {
      getObjectBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      saveObject: vi.fn(async () => undefined),
    };
    const extractor = createPdfPageExtractor({
      objectStore: objectStore as never,
      renderPdfPages: async () => [
        { pageNo: 1, bytes: new Uint8Array([9]), contentType: 'image/png' },
      ],
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
});
