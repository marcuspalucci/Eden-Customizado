import { useQuery } from '@tanstack/react-query';
import { getBibleContent } from '../../services/geminiService';
import { BibleReference } from '../../types';

export const useBibleContentQuery = (ref: BibleReference) =>
  useQuery({
    queryKey: ['bibleContent', ref.book, ref.chapter, ref.translation],
    queryFn: () => getBibleContent(ref.book, ref.chapter, ref.translation),
    staleTime: Infinity, // texto bíblico nunca muda
    enabled: Boolean(ref.book && ref.chapter && ref.translation),
  });
