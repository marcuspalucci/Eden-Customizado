import { renderHook, act } from '@testing-library/react';
import { useNotesManager } from '../useNotesManager';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, auth } from '../../services/firebase';
import { useErrorHandler } from '../useErrorHandler';

vi.mock('../../services/firebase', () => ({
  db: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn(),
  },
  auth: {
    currentUser: { uid: 'user123' },
  },
}));

vi.mock('../useErrorHandler', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}));

vi.mock('firebase/compat/app', () => ({
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'mock-timestamp'),
      },
    },
  },
}));

describe('useNotesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleNoteChange atualiza noteContent', () => {
    const { result } = renderHook(() => useNotesManager(false));

    act(() => {
      result.current.handleNoteChange({
        target: { value: 'minha nota' },
      } as React.ChangeEvent<HTMLTextAreaElement>);
    });

    expect(result.current.noteContent).toBe('minha nota');
  });

  it('handleNoteChange NÃO persiste no Firestore quando isGuest = true', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNotesManager(true));

    act(() => {
      result.current.handleNoteChange({
        target: { value: 'nota de visitante' },
      } as React.ChangeEvent<HTMLTextAreaElement>);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(vi.mocked(db.collection)).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('addToNotes adiciona texto como citação e retorna string atualizada', () => {
    const { result } = renderHook(() => useNotesManager(false));

    let returned: string | undefined;
    act(() => {
      returned = result.current.addToNotes('João 3:16');
    });

    expect(returned).toContain('> "João 3:16"');
    expect(result.current.noteContent).toContain('> "João 3:16"');
  });

  it('exportNotesTxt cria um link de download e chama click()', () => {
    const { result } = renderHook(() => useNotesManager(false));

    const mockClick = vi.fn();
    const mockAnchor = document.createElement('a');
    mockAnchor.click = mockClick;

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, ...args: unknown[]) => {
        if (tag === 'a') return mockAnchor;
        return originalCreateElement(tag, ...(args as [ElementCreationOptions?]));
      });

    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    const revokeObjectURLSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

    act(() => {
      result.current.exportNotesTxt();
    });

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('handleTextSelection ignora seleção fora de .text-bible-text', () => {
    const { result } = renderHook(() => useNotesManager(false));

    // Elemento sem classe .text-bible-text — parentElement não pertence a esse container
    const outerDiv = document.createElement('div');
    const span = document.createElement('span');
    outerDiv.appendChild(span);

    const mockSelection = {
      toString: () => 'texto selecionado',
      anchorNode: span,
      getRangeAt: vi.fn(),
    };

    const getSelectionSpy = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue(mockSelection as unknown as Selection);

    act(() => {
      result.current.handleTextSelection(new MouseEvent('mouseup'));
    });

    expect(result.current.showSelectionMenu).toBe(false);

    getSelectionSpy.mockRestore();
  });
});
