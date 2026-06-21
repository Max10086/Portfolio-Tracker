'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ThemeMode = 'light' | 'dark';

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('theme') as ThemeMode | null;
    const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const nextTheme: ThemeMode = stored || (preferredDark ? 'dark' : 'light');
    setTheme(nextTheme);
    applyTheme(nextTheme);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('theme', next);
    applyTheme(next);
  };

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" disabled>
        Theme
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={toggleTheme}>
      {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
      {theme === 'dark' ? 'Light' : 'Dark'} Mode
    </Button>
  );
}
