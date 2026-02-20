'use client';

import { useEffect } from 'react';

type AdSlotProps = {
  slot?: string;
  label: string;
  className?: string;
};

export default function AdSlot({ slot, label, className = '' }: AdSlotProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const enabled = Boolean(client && slot);

  useEffect(() => {
    if (!enabled) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // noop
    }
  }, [enabled, slot]);

  return (
    <section className={`ad-slot ${className}`.trim()} aria-label={label}>
      <div className="ad-slot__label">AD</div>
      {enabled ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <p className="ad-slot__placeholder">{label} (AdSense slot placeholder)</p>
      )}
    </section>
  );
}
