import { useEffect, useRef, useState } from 'react';

export function useAutoSave(key: string, data: any, delay: number = 1000) {
  const isFirstRender = useRef(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    // Skip saving on the very first render to prevent overwriting existing drafts with initial empty state
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setSaveStatus('saving');

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        setSaveStatus('saved');
        
        // Reset back to idle after a couple of seconds to clear the indicator
        setTimeout(() => {
          setSaveStatus(prev => prev === 'saved' ? 'idle' : prev);
        }, 2000);
      } catch (err) {
        console.error('Failed to save draft to localStorage:', err);
        setSaveStatus('idle');
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [key, data, delay]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error('Failed to clear draft from localStorage:', err);
    }
  };

  return { clearDraft, saveStatus };
}

export function loadDraft<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      return JSON.parse(item) as T;
    }
  } catch (err) {
    console.error('Failed to load draft from localStorage:', err);
  }
  return null;
}
