'use client';

import { useRef, useState } from 'react';
import { SectionCard } from './SectionCard';

type Props = {
  onImportCsv: (file: File) => Promise<void>;
  onImportScreenshot: (file: File) => Promise<void>;
};

export function ImportPanel({ onImportCsv, onImportScreenshot }: Props) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);

  return (
    <SectionCard title="Watchlist">
      <div className="stack">
        {/* CSV upload zone */}
        <div className="upload-zone" onClick={() => csvRef.current?.click()}>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
          />
          <div className="upload-zone-label">Screener.in CSV</div>
          <div style={{ fontSize: 20, margin: '4px 0' }}>↑</div>
          {csvFile && <div className="upload-zone-filename">{csvFile.name}</div>}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => csvFile && onImportCsv(csvFile)}
          disabled={!csvFile}
        >
          Import
        </button>

        {/* Screenshot upload zone */}
        <div className="upload-zone" onClick={() => screenshotRef.current?.click()}>
          <input
            ref={screenshotRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
          />
          <div className="upload-zone-label">Screener.in Screenshot</div>
          <div style={{ fontSize: 20, margin: '4px 0' }}>↑</div>
          {screenshotFile && <div className="upload-zone-filename">{screenshotFile.name}</div>}
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => screenshotFile && onImportScreenshot(screenshotFile)}
          disabled={!screenshotFile}
        >
          Import
        </button>
      </div>
    </SectionCard>
  );
}
