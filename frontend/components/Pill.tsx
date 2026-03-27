'use client';

export function Pill({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'green' | 'yellow' | 'red' | 'blue' | 'slate';
}) {
  return <span className={`pill pill-${tone}`}>{label}</span>;
}
