'use client';

import { useState } from 'react';
import { SectionCard } from './SectionCard';

type Props = {
  onImportCsv: (file: File) => Promise<void>;
  onImportScreenshot: (file: File) => Promise<void>;
};

export function ImportPanel({ onImportCsv, onImportScreenshot }: Props) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  return (
    <SectionCard title="2. Import Screener Data">
      <div className="stack">
        <label>
          <span>CSV upload</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
          />
        </label>
        <button
          className="btn btn-primary"
          onClick={() => csvFile && onImportCsv(csvFile)}
          disabled={!csvFile}
        >
          Import CSV
        </button>

        <label>
          <span>Screenshot upload</span>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
          />
        </label>
        <button
          className="btn btn-secondary"
          onClick={() => screenshotFile && onImportScreenshot(screenshotFile)}
          disabled={!screenshotFile}
        >
          Import Screenshot
        </button>
      </div>
    </SectionCard>
  );
}
