'use client';

import { useEffect, useRef } from 'react';

export default function TradingViewMarketOverview() {
  const widgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!widgetRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.async = true;
    script.textContent = JSON.stringify({
      colorTheme: 'light',
      dateRange: '12M',
      showChart: true,
      locale: 'ja',
      largeChartUrl: '',
      isTransparent: false,
      showSymbolLogo: false,
      showFloatingTooltip: true,
      width: '100%',
      height: 550,
      plotLineColorGrowing: 'rgba(41, 98, 255, 1)',
      plotLineColorFalling: 'rgba(41, 98, 255, 1)',
      gridLineColor: 'rgba(46, 46, 46, 0)',
      scaleFontColor: 'rgba(15, 15, 15, 1)',
      belowLineFillColorGrowing: 'rgba(41, 98, 255, 0.12)',
      belowLineFillColorFalling: 'rgba(41, 98, 255, 0.12)',
      belowLineFillColorGrowingBottom: 'rgba(41, 98, 255, 0)',
      belowLineFillColorFallingBottom: 'rgba(41, 98, 255, 0)',
      symbolActiveColor: 'rgba(41, 98, 255, 0.12)',
      tabs: [
        {
          title: '為替チャート',
          symbols: [
            { s: 'FX:USDJPY', d: 'USD/JPY' },
            { s: 'OANDA:EURJPY', d: 'EUR/JPY' },
            { s: 'FX_IDC:CNHJPY', d: 'CNH/JPY' },
            { s: 'OANDA:GBPJPY', d: 'GBP/JPY' }
          ],
          originalTitle: '為替チャート'
        }
      ]
    });

    widgetRef.current.innerHTML = '';
    widgetRef.current.appendChild(script);
  }, []);

  return <div className="tradingview-widget-container w-full" ref={widgetRef} />;
}

