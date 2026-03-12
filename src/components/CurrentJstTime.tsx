'use client';

import { useEffect, useState } from 'react';

function formatJstNow(): { date: string; time: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return { date, time };
}

export default function CurrentJstTime() {
  const [current, setCurrent] = useState(() => formatJstNow());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrent(formatJstNow());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="text-sm sm:text-xl font-mono font-bold text-off-white tracking-[0.08em] sm:tracking-widest">
      {current.date} <span className="text-positive">{current.time}</span>
    </p>
  );
}
