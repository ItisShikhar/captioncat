import { Button } from '@/ui/shadcn/button';
import { useThemeToggle } from '@/ui/hooks/use-theme-toggle';
import { Moon, Sun } from 'lucide-react';

/**
 * Light/dark toggle. Uses `resolvedTheme` (not `theme`) so it reflects the
 * OS preference correctly when the user hasn't explicitly picked a side yet,
 * and always toggles to an explicit light/dark choice (never back to
 * "system") once clicked - the simplest predictable behavior for a single
 * toggle button. Rendered as a disabled placeholder until mounted since
 * next-themes cannot know the persisted/system preference before its first
 * effect runs, avoiding a flash of the wrong icon.
 */
export function ThemeToggle() {
  const { mounted, isDark, toggleTheme } = useThemeToggle();

  if (!mounted) {
    return (
      <Button type="button" variant="outline" size="icon" disabled aria-label="Toggle theme">
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}
