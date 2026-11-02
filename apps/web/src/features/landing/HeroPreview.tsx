/**
 * Decorative preview of the exam screen (desktop hero). It is a static illustration, not real exam
 * content: the sample question is a generic algebra example, hidden from assistive tech details by role=img.
 */
const OPTIONS = [
  { key: 'A', text: 'x = 3 or x = −½', selected: true },
  { key: 'B', text: 'x = −3 or x = ½' },
  { key: 'C', text: 'x = 3 or x = ½' },
  { key: 'D', text: 'x = −3 or x = −½' },
];

const DOTS = Array.from({ length: 20 }, (_, i) => (i === 6 ? 'f' : i < 11 ? 'a' : i === 11 ? 'c' : 'u'));

export function HeroPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the exam screen"
      className="hidden min-w-0 flex-[1_1_400px] overflow-hidden rounded-[20px] border border-border bg-surface shadow-preview lg:block"
    >
      <div className="flex items-center justify-between border-b border-border px-[18px] py-3.5">
        <div className="flex flex-col">
          <span className="text-[13px] text-muted">Secondary Mathematics · Mock 1</span>
          <span className="text-[15px] font-bold">Question 12 of 50</span>
        </div>
        <span className="tabular rounded-[10px] bg-soft px-3 py-2 font-bold">42:18</span>
      </div>
      <div className="flex flex-col gap-3 px-[18px] py-5">
        <p className="m-0 text-[17px] font-semibold leading-snug">Solve for x: 2x² − 5x − 3 = 0</p>
        {OPTIONS.map((o) => (
          <div
            key={o.key}
            className={`flex items-center gap-3 rounded-control px-3.5 py-3 ${o.selected ? 'border-2 border-brand bg-brand-softer' : 'border border-border bg-surface'}`}
          >
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${o.selected ? 'bg-brand text-white' : 'bg-soft text-ink-2'}`}
            >
              {o.key}
            </span>
            <span className="text-[15px]">{o.text}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-10 gap-1.5 px-[18px] pb-[18px]">
        {DOTS.map((d, i) => (
          <span
            key={i}
            className={`h-[22px] rounded-md border ${
              d === 'a' ? 'border-transparent bg-brand' : d === 'f' ? 'border-flagged bg-flagged-bg' : d === 'c' ? 'border-ink bg-surface' : 'border-transparent bg-soft'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
