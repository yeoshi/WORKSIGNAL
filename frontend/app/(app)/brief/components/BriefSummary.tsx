/**
 * Renders the generated brief text with section headers and action items.
 */

const KNOWN_SECTION_HEADERS = new Set([
  'Agent Accuracy',
  'Next Week',
  'This Week',
  'Key Actions',
]);

type BriefBlock =
  | { kind: 'date'; content: string }
  | { kind: 'paragraph'; content: string }
  | { kind: 'section'; title: string; content: string };

function isDateLine(line: string): boolean {
  return /^Week of /i.test(line.trim());
}

function parseBriefText(text: string): BriefBlock[] {
  const blocks = text.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
  const parsed: BriefBlock[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);

    if (lines.length === 1) {
      if (isDateLine(lines[0])) {
        parsed.push({ kind: 'date', content: lines[0] });
      } else {
        parsed.push({ kind: 'paragraph', content: lines[0] });
      }
      continue;
    }

    const [firstLine, ...rest] = lines;
    if (KNOWN_SECTION_HEADERS.has(firstLine) || (firstLine.length < 48 && !firstLine.endsWith('.'))) {
      parsed.push({
        kind: 'section',
        title: firstLine,
        content: rest.join('\n'),
      });
      continue;
    }

    parsed.push({ kind: 'paragraph', content: block });
  }

  return parsed;
}

function parseActionItems(content: string): string[] {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[•\-*]\s+/.test(line));

  if (bulletLines.length > 0) {
    return bulletLines.map((line) => line.replace(/^[•\-*]\s+/, ''));
  }

  return lines;
}

function ActionList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2" role="list">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-relaxed text-ws-ink">
          <span className="mt-0.5 shrink-0 text-ws-accent" aria-hidden>
            →
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export interface BriefSummaryProps {
  briefText: string;
}

export function BriefSummary({ briefText }: BriefSummaryProps) {
  const blocks = parseBriefText(briefText);

  return (
    <section aria-label="Generated brief" data-testid="brief-text">
      <h2 className="ws-section-label">Summary</h2>
      <div className="space-y-5 rounded-lg border border-ws-line bg-ws-card p-5">
        {blocks.map((block, index) => {
          if (block.kind === 'date') {
            return (
              <p
                key={`date-${index}`}
                className="text-xs font-medium uppercase tracking-wide text-ws-muted"
              >
                {block.content}
              </p>
            );
          }

          if (block.kind === 'paragraph') {
            return (
              <p
                key={`paragraph-${index}`}
                className="text-sm leading-relaxed text-ws-muted"
              >
                {block.content}
              </p>
            );
          }

          const isActionSection =
            block.title === 'Next Week' ||
            block.title === 'This Week' ||
            block.title === 'Key Actions';
          const actionItems = isActionSection ? parseActionItems(block.content) : [];

          return (
            <div key={`section-${block.title}-${index}`}>
              <h3 className="text-sm font-semibold text-ws-ink">{block.title}</h3>
              {isActionSection && actionItems.length > 0 ? (
                <ActionList items={actionItems} />
              ) : (
                <p className="mt-1.5 text-sm leading-relaxed text-ws-muted">{block.content}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
