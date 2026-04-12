import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('renders the MVP brand heading', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'AI 批改作业演示站' })
    ).toBeInTheDocument();
  });

  it('uses a button instead of a hash link for the hero demo CTA', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '立即体验批改演示' }));

    expect(
      screen.getByRole('heading', { name: '先填标准答案，再上传学生答题卡' })
    ).toBeInTheDocument();
  });
});
