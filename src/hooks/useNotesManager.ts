import { useState, useRef, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import { db, auth } from '../services/firebase';
import { useErrorHandler } from './useErrorHandler';

interface SelectionPos {
  x: number;
  y: number;
}

export const useNotesManager = (isGuest: boolean) => {
  const { handleError } = useErrorHandler();
  const [noteContent, setNoteContent] = useState('');
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [selectionPos, setSelectionPos] = useState<SelectionPos>({ x: 0, y: 0 });
  const [selectionText, setSelectionText] = useState('');
  const noteSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistNote = useCallback(async (content: string) => {
    if (isGuest || !auth.currentUser) return;
    try {
      await db
        .collection('users')
        .doc(auth.currentUser.uid)
        .collection('notes')
        .doc('default')
        .set(
          { content, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
    } catch (e) {
      handleError(e);
    }
  }, [isGuest, handleError]);

  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setNoteContent(newContent);
      if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
      if (isGuest) return;
      noteSaveTimeoutRef.current = setTimeout(() => persistNote(newContent), 1000);
    },
    [isGuest, persistNote]
  );

  const addToNotes = useCallback(
    (text: string): string => {
      const appendText = `\n> "${text}"\n`;
      const updated = noteContent + appendText;
      setNoteContent(updated);
      persistNote(updated);
      return updated;
    },
    [noteContent, persistNote]
  );

  const hideSelectionMenu = useCallback(() => setShowSelectionMenu(false), []);

  const handleTextSelection = useCallback((e: MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      setShowSelectionMenu(false);
      return;
    }
    const anchorNode = selection.anchorNode;
    const element =
      anchorNode?.nodeType === 3 ? anchorNode.parentElement : (anchorNode as Element);
    if (!element?.closest('.text-bible-text')) {
      setShowSelectionMenu(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const isLargeSelection = rect.height > 50 || rect.width > 300;

    let x: number, y: number;
    if (isLargeSelection) {
      x = Math.min(Math.max(e.clientX, 80), window.innerWidth - 80);
      y = Math.max(e.clientY - 50, 60);
    } else {
      x = rect.left + rect.width / 2;
      y = Math.max(rect.top - 10, 60);
    }
    x = Math.min(Math.max(x, 80), window.innerWidth - 80);

    setSelectionPos({ x, y });
    setSelectionText(selection.toString());
    setShowSelectionMenu(true);
  }, []);

  const exportNotesTxt = useCallback(() => {
    const blob = new Blob([noteContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eden-notes-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [noteContent]);

  const exportNotesPdf = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Anotações ÉDEN</title>
            <style>
              body { font-family: 'Georgia', serif; padding: 40px; line-height: 1.6; color: #3E2723; background: #F5F5DC; }
              h1 { color: #388E3C; border-bottom: 2px solid #D7CCC8; padding-bottom: 10px; }
              pre { white-space: pre-wrap; font-family: 'Georgia', serif; }
              blockquote { border-left: 4px solid #388E3C; margin: 0; padding-left: 20px; color: #5D4037; font-style: italic; }
            </style>
          </head>
          <body>
            <h1>Minhas Anotações - ÉDEN</h1>
            <p style="font-size: 12px; color: #888;">Gerado em: ${new Date().toLocaleString()}</p>
            <pre>${noteContent.replace(/> "(.*?)"/g, '<blockquote>$1</blockquote>')}</pre>
            <script>window.onload = function() { window.print(); }<\/script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }, [noteContent]);

  return {
    noteContent,
    setNoteContent,
    showSelectionMenu,
    selectionPos,
    selectionText,
    handleNoteChange,
    addToNotes,
    hideSelectionMenu,
    handleTextSelection,
    exportNotesTxt,
    exportNotesPdf,
  };
};
