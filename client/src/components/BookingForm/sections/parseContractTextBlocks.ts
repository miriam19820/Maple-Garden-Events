export type TextBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  // Short section titles only (e.g. "ביטול הזמנה:") — avoid bolding long prose that ends with ":".
  return (
    trimmed.endsWith(':')
    && trimmed.length > 1
    && trimmed.length <= 40
    && !/^\d+\./.test(trimmed)
    && !/[.!?…]/.test(trimmed.slice(0, -1))
  );
}

function isBulletLine(line: string): boolean {
  return /^[•·-]\s+/.test(line.trim());
}

function isNumberedLine(line: string): boolean {
  return /^\d+\.\s+/.test(line.trim());
}

/** Split plain contract text into readable RTL blocks (headings / paragraphs / lists). */
export function parseContractTextBlocks(text: string): TextBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: TextBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered: boolean | null = null;

  const flushParagraph = () => {
    const content = paragraphLines.join(' ').replace(/\s+/g, ' ').trim();
    paragraphLines = [];
    if (content) blocks.push({ type: 'paragraph', text: content });
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({
      type: 'list',
      ordered: listOrdered === true,
      items: listItems,
    });
    listItems = [];
    listOrdered = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    if (isHeadingLine(line)) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'heading', text: line });
      continue;
    }

    if (isNumberedLine(line)) {
      flushParagraph();
      if (listOrdered === false) flushList();
      listOrdered = true;
      listItems.push(line.replace(/^\d+\.\s+/, ''));
      continue;
    }

    if (isBulletLine(line)) {
      flushParagraph();
      if (listOrdered === true) flushList();
      listOrdered = false;
      listItems.push(line.replace(/^[•·-]\s+/, ''));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushList();
  flushParagraph();
  return blocks;
}
