'use client';

import { useState } from 'react';

type SafeImageProps = {
  src?: string;
  fallback: string;
  alt: string;
  className?: string;
};

export default function SafeImage({ src, fallback, alt, className }: SafeImageProps) {
  const initial = src && /^https?:\/\//i.test(src) ? src : fallback;
  const [current, setCurrent] = useState(initial);

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}
