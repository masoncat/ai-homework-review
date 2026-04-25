import { render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import BatchReviewBottomNav from './BatchReviewBottomNav';

describe('BatchReviewBottomNav', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('highlights the active overview tab', () => {
    window.location.hash = '#/batch-review';

    render(
      <HashRouter>
        <BatchReviewBottomNav />
      </HashRouter>
    );

    expect(screen.getByRole('link', { name: '任务中心' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: '新建任务' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: '通知' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('highlights the active new-task tab', () => {
    window.location.hash = '#/batch-review/new';

    render(
      <HashRouter>
        <BatchReviewBottomNav />
      </HashRouter>
    );

    expect(screen.getByRole('link', { name: '新建任务' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('highlights the active notifications tab', () => {
    window.location.hash = '#/batch-review/notifications';

    render(
      <HashRouter>
        <BatchReviewBottomNav />
      </HashRouter>
    );

    expect(screen.getByRole('link', { name: '通知' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
