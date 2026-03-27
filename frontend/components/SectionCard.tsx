'use client';

import React from 'react';

export function SectionCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
