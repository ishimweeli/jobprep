/** Simple stroke icons from the artboards (Lucide-style paths, 24 x 24). */
export const ICON_PATHS = {
  progress: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  access: 'M3 6h18v13H3z M3 10h18',
  country: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  language: 'M4 5h7 M7.5 3v2 M5 9c1.5 3 4 5 7 6 M10 5c-1 5-3 8-6 10 M13 21l4.5-10L22 21 M14.5 18h5',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  signOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  tests: 'M9 3h6v3H9z M7 5H5v16h14V5h-2 M8 11h8 M8 15h5',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function StrokeIcon({ name, size = 20, strokeWidth = 2, className }: { name: IconName; size?: number; strokeWidth?: number; className?: string }) {
  const d = ICON_PATHS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}
