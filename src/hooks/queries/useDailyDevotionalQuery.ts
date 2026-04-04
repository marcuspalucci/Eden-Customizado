import { useQuery } from '@tanstack/react-query';
import { getDailyDevotional } from '../../services/geminiService';
import { Language } from '../../types';

export const useDailyDevotionalQuery = (lang: Language) =>
  useQuery({
    queryKey: ['dailyDevotional', lang],
    queryFn: () => getDailyDevotional(lang),
    staleTime: 1000 * 60 * 60 * 6, // 6h — devocional do dia não muda frequentemente
  });
