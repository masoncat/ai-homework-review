import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ResultPage from './ResultPage';

describe('ResultPage', () => {
  it('shows score, question matrix, and retry action', () => {
    render(<ResultPage />);

    expect(screen.getByText('92 分')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '再试一张答题卡' })
    ).toBeInTheDocument();
  });
});
