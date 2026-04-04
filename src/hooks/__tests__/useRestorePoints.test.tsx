import { renderHook, act } from '@testing-library/react';
import { useRestorePoints } from '../useRestorePoints';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '../../contexts/AuthContext';
import { TabView } from '../../types';

// As funções de mock precisam ser criadas inline dentro de vi.mock para evitar
// problema de hoisting. Exportamos as referências depois via vi.mocked.
vi.mock('../../services/firebase', () => {
  const addFn = vi.fn().mockResolvedValue({ id: 'firestore-doc-id' });
  const getFn = vi.fn().mockResolvedValue({ docs: [] });
  const deleteFn = vi.fn().mockResolvedValue(undefined);
  const orderByFn = vi.fn();
  const docFn = vi.fn();
  const collectionFn = vi.fn();

  // Encadeamento: collection().doc().collection().add()
  // e              collection().doc().collection().orderBy().get()
  const innerCollection = {
    add: addFn,
    orderBy: vi.fn().mockReturnValue({ get: getFn }),
    doc: vi.fn().mockReturnValue({ delete: deleteFn, set: vi.fn() }),
  };

  const docObj = {
    collection: vi.fn().mockReturnValue(innerCollection),
    set: vi.fn(),
    delete: deleteFn,
  };

  collectionFn.mockReturnValue({
    doc: vi.fn().mockReturnValue(docObj),
    orderBy: vi.fn().mockReturnValue({ get: getFn }),
    add: addFn,
  });

  return {
    db: { collection: collectionFn },
    auth: { currentUser: { uid: 'user123' } },
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
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

const baseRestorePointData = {
  reference: { book: 'Gênesis', chapter: 1, translation: 'NVI' },
  activeTab: TabView.READING,
  noteContent: '',
  compareMode: false,
};

describe('useRestorePoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveRestorePoint salva no Firestore quando usuário está logado', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
    } as unknown as ReturnType<typeof useAuth>);

    // Importa db para verificar as chamadas após clearAllMocks
    const { db } = await import('../../services/firebase');

    // Reconfigura o encadeamento após clearAllMocks
    const addMock = vi.fn().mockResolvedValue({ id: 'firestore-doc-id' });
    const innerCollectionMock = { add: addMock, orderBy: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [] }) }) };
    const docMock = { collection: vi.fn().mockReturnValue(innerCollectionMock), set: vi.fn() };
    vi.mocked(db.collection).mockReturnValue({ doc: vi.fn().mockReturnValue(docMock) } as ReturnType<typeof db.collection>);

    const { result } = renderHook(() => useRestorePoints());

    await act(async () => {
      await result.current.saveRestorePoint(baseRestorePointData);
    });

    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: baseRestorePointData.reference,
        activeTab: TabView.READING,
        noteContent: '',
        compareMode: false,
      })
    );
  });

  it('saveRestorePoint adiciona localmente quando isGuest = true', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'guest-uid', email: 'guest@dev.local' },
    } as unknown as ReturnType<typeof useAuth>);

    const { db } = await import('../../services/firebase');
    vi.mocked(db.collection).mockReturnValue({
      doc: vi.fn(),
      add: vi.fn(),
    } as ReturnType<typeof db.collection>);

    const { result } = renderHook(() => useRestorePoints());

    await act(async () => {
      await result.current.saveRestorePoint(baseRestorePointData);
    });

    expect(result.current.restorePoints).toHaveLength(1);
    expect(result.current.restorePoints[0].id).toMatch(/^local-/);
    expect(vi.mocked(db.collection)).not.toHaveBeenCalled();
  });

  it('deleteRestorePoint remove item localmente quando isGuest', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'guest-uid', email: 'guest@dev.local' },
    } as unknown as ReturnType<typeof useAuth>);

    const { db } = await import('../../services/firebase');
    vi.mocked(db.collection).mockReturnValue({
      doc: vi.fn(),
      add: vi.fn(),
    } as ReturnType<typeof db.collection>);

    const { result } = renderHook(() => useRestorePoints());

    // Adiciona um ponto localmente
    await act(async () => {
      await result.current.saveRestorePoint(baseRestorePointData);
    });

    expect(result.current.restorePoints).toHaveLength(1);
    const localId = result.current.restorePoints[0].id;

    // Remove o ponto
    await act(async () => {
      await result.current.deleteRestorePoint(localId);
    });

    expect(result.current.restorePoints).toHaveLength(0);
  });

  it('fetchRestorePoints NÃO executa para guest', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'guest-uid', email: 'guest@dev.local' },
    } as unknown as ReturnType<typeof useAuth>);

    const { db } = await import('../../services/firebase');
    const collectionSpy = vi.mocked(db.collection);

    const { result } = renderHook(() => useRestorePoints());

    await act(async () => {
      await result.current.fetchRestorePoints();
    });

    expect(collectionSpy).not.toHaveBeenCalled();
  });

  it('fetchRestorePoints NÃO executa quando auth.currentUser é null', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
    } as unknown as ReturnType<typeof useAuth>);

    const firebaseModule = await import('../../services/firebase');
    // Simula usuário não autenticado
    Object.defineProperty(firebaseModule.auth, 'currentUser', {
      value: null,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useRestorePoints());

    await act(async () => {
      await result.current.fetchRestorePoints();
    });

    expect(vi.mocked(firebaseModule.db.collection)).not.toHaveBeenCalled();

    // Restaura auth.currentUser para não impactar outros testes
    Object.defineProperty(firebaseModule.auth, 'currentUser', {
      value: { uid: 'user123' },
      writable: true,
      configurable: true,
    });
  });
});
