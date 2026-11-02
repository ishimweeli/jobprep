import { Building2, Calculator, ClipboardList, GraduationCap, Landmark, LayoutGrid, Monitor, type LucideIcon } from 'lucide-react';

/** Category icon names come from the API (`category.icon`); unknown names fall back to a grid. */
const ICONS: Record<string, LucideIcon> = {
  monitor: Monitor,
  'graduation-cap': GraduationCap,
  landmark: Landmark,
  building: Building2,
  calculator: Calculator,
  'clipboard-list': ClipboardList,
  'layout-grid': LayoutGrid,
};

export function CategoryIcon({ name, size = 24 }: { name: string | null | undefined; size?: number }) {
  const Icon = (name && ICONS[name]) || LayoutGrid;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}
