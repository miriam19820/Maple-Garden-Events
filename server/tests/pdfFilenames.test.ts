import {
  buildContractPdfFilename,
  buildProductionPdfFilename,
  combineFamilyNames,
  contentDispositionHeader,
  extractLastName,
  filenameFromContentDisposition,
  sanitizePdfFilename,
} from '../../shared/contract/pdfFilenames';

describe('sanitizePdfFilename', () => {
  it('strips illegal path characters and keeps Hebrew and spaces', () => {
    expect(sanitizePdfFilename('חוזה חתונה כהן/לוי:*.pdf')).toBe('חוזה חתונה כהן לוי.pdf');
  });

  it('collapses whitespace and trims dots', () => {
    expect(sanitizePdfFilename('  טופס   הפקה  .pdf')).toBe('טופס הפקה.pdf');
  });
});

describe('family names and document titles', () => {
  it('joins last names with ו', () => {
    expect(combineFamilyNames('דוד כהן', 'רחל לוי')).toBe('כהן ולוי');
    expect(extractLastName('ישראל ישראלי')).toBe('ישראלי');
  });

  it('builds the contract filename from event type and families', () => {
    expect(buildContractPdfFilename({
      eventType: 'חתונה',
      clientAFullName: 'דוד כהן',
      clientBFullName: 'רחל לוי',
    })).toBe('חוזה חתונה כהן ולוי.pdf');
  });

  it('builds the production-form filename from event type and families', () => {
    expect(buildProductionPdfFilename({
      eventType: 'חתונה',
      clientAFullName: 'דוד כהן',
      clientBFullName: 'רחל לוי',
    })).toBe('טופס הפקת אירוע חתונה כהן ולוי.pdf');
  });

  it('omits a missing second family without blocking', () => {
    expect(buildContractPdfFilename({
      eventType: 'בר מצווה',
      clientAFullName: 'יוסי לוי',
    })).toBe('חוזה בר מצווה לוי.pdf');
  });
});

describe('Content-Disposition', () => {
  it('emits RFC 5987 filename* for Hebrew', () => {
    const header = contentDispositionHeader(
      'חוזה חתונה כהן ולוי.pdf',
      'attachment',
      'contract-EVT1.pdf',
    );
    expect(header).toContain('filename="contract-EVT1.pdf"');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('חוזה חתונה כהן ולוי.pdf'));
  });

  it('parses filename* back to the Hebrew name', () => {
    const header = contentDispositionHeader(
      'טופס הפקת אירוע חתונה כהן ולוי.pdf',
      'inline',
      'event-form-1.pdf',
    );
    expect(filenameFromContentDisposition(header, 'fallback.pdf')).toBe(
      'טופס הפקת אירוע חתונה כהן ולוי.pdf',
    );
  });
});
