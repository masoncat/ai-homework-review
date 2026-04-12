import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('HomePage', () => {
  it('prefills the invite code from the page query string', () => {
    window.history.replaceState({}, '', '/?inviteCode=url-demo#/');

    render(<HomePage />);

    expect(screen.getByPlaceholderText('输入体验码')).toHaveValue('url-demo');
  });

  it('falls back to the hash query string when the page query string is empty', () => {
    window.history.replaceState({}, '', '/#/?inviteCode=hash-demo');

    render(<HomePage />);

    expect(screen.getByPlaceholderText('输入体验码')).toHaveValue('hash-demo');
  });

  it('shows the answer key helper copy and invite code field', () => {
    render(<HomePage />);

    expect(screen.getByText('先填标准答案，再上传学生答题卡')).toBeInTheDocument();
    expect(screen.getByText('第 1 步')).toBeInTheDocument();
    expect(screen.getByText('第 2 步')).toBeInTheDocument();
    expect(screen.getByText('第 3 步')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '填入演示答案' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入体验码')).toBeInTheDocument();
    expect(
      screen.getByText(/先上传答题卡图片，再开始体验/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /下载演示答题卡图片/ })
    ).toHaveAttribute('href', 'test-sheets/scheme-b-filled.png');
  });

  it('requests a session before starting upload', async () => {
    const requestSession = vi
      .fn()
      .mockResolvedValue({ accessToken: 'token', expiresInSeconds: 7200 });
    const requestUploadPolicy = vi.fn().mockResolvedValue({
      objectKey: 'uploads/demo/sheet.jpg',
      uploadUrl: 'https://oss.example.com/uploads/demo/sheet.jpg',
      method: 'PUT',
      expiresInSeconds: 300,
      headers: { 'content-type': 'image/jpeg' },
    });
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const submitGrade = vi.fn().mockResolvedValue({
      taskId: 'task-123',
      score: 92,
      correctCount: 11,
      totalCount: 12,
      focusQuestionNos: [3],
      summary: '共批改 12 题，建议重点复看 3 题。',
      teachingAdvice: ['先复盘选择题错因'],
      items: [],
    });

    render(
      <HomePage
        requestSession={requestSession}
        requestUploadPolicy={requestUploadPolicy}
        uploadFile={uploadFile}
        submitGrade={submitGrade}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('输入体验码'), {
      target: { value: 'demo-code' },
    });
    fireEvent.change(screen.getByLabelText('答题卡图片'), {
      target: {
        files: [new File(['sheet'], 'sheet.jpg', { type: 'image/jpeg' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始体验' }));

    await waitFor(() => {
      expect(requestSession).toHaveBeenCalledWith({
        inviteCode: 'demo-code',
        humanToken: 'pass-human-check',
      });
    });
  });

  it('uploads the selected answer sheet and requests grading', async () => {
    const requestSession = vi
      .fn()
      .mockResolvedValue({ accessToken: 'token', expiresInSeconds: 7200 });
    const requestUploadPolicy = vi.fn().mockResolvedValue({
      objectKey: 'uploads/demo/sheet.jpg',
      uploadUrl: 'https://oss.example.com/uploads/demo/sheet.jpg',
      method: 'PUT',
      expiresInSeconds: 300,
      headers: { 'content-type': 'image/jpeg' },
    });
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const submitGrade = vi.fn().mockResolvedValue({
      taskId: 'task-123',
      score: 92,
      correctCount: 11,
      totalCount: 12,
      focusQuestionNos: [3],
      summary: '共批改 12 题，建议重点复看 3 题。',
      teachingAdvice: ['先复盘选择题错因'],
      items: [],
    });

    render(
      <HomePage
        requestSession={requestSession}
        requestUploadPolicy={requestUploadPolicy}
        uploadFile={uploadFile}
        submitGrade={submitGrade}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('输入体验码'), {
      target: { value: 'demo-code' },
    });
    fireEvent.change(screen.getByLabelText('答题卡图片'), {
      target: {
        files: [new File(['sheet'], 'sheet.jpg', { type: 'image/jpeg' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始体验' }));

    await waitFor(() => {
      expect(requestUploadPolicy).toHaveBeenCalledWith('token', 'sheet.jpg');
    });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        objectKey: 'uploads/demo/sheet.jpg',
      }),
      'token'
    );
    await waitFor(() => {
      expect(submitGrade).toHaveBeenCalledWith({
        accessToken: 'token',
        answerKey: '1.A 2.C 3.B 4.D 5.A 6.B 7.C 8.D 9.12 10.3/4 11.18 12.24',
        objectKey: 'uploads/demo/sheet.jpg',
      });
    });
  });

  it('requires an answer sheet image before calling the real api flow', async () => {
    const requestSession = vi.fn();

    render(
      <HomePage
        requestSession={requestSession}
        requestUploadPolicy={vi.fn()}
        uploadFile={vi.fn()}
        submitGrade={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('输入体验码'), {
      target: { value: 'demo-code' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始体验' }));

    await waitFor(() => {
      expect(screen.getByText('请先上传答题卡图片')).toBeInTheDocument();
    });

    expect(requestSession).not.toHaveBeenCalled();
  });
});
