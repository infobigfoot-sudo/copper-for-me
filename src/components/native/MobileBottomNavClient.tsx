'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isOtherNavPath, NativeNavIcon, OTHER_NAV_LINKS, PRIMARY_NAV_LINKS } from '@/components/native/nav';

export default function MobileBottomNavClient() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const isOtherActive = useMemo(() => isOtherNavPath(pathname), [pathname]);
  if (!mounted) return null;

  return createPortal(
    <nav
      className="md:hidden"
      aria-label="モバイルナビゲーション"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        borderTop: '1px solid #d9d2c6',
        borderLeft: '0',
        borderRight: '0',
        borderBottom: '0',
        borderRadius: 0,
        background: 'rgba(243, 241, 237, 0.99)',
        boxShadow: '0 -8px 22px rgba(15, 23, 42, 0.12)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)',
      }}
    >
      <div style={{ display: 'flex', gap: 4, padding: '8px 8px 0', minHeight: 60 }}>
        {PRIMARY_NAV_LINKS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={`mobile-primary-${item.href}`}
              href={item.href}
              style={{
                flex: 1,
                borderRadius: 8,
                padding: '6px 0',
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '.01em',
                color: active ? '#8b6b4f' : '#475569',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                textDecoration: 'none',
              }}
            >
              <NativeNavIcon icon={item.icon} style={{ width: 16, height: 16 }} />
              <span style={active ? { borderBottom: '2px solid #8b6b4f', paddingBottom: 1 } : undefined}>{item.label}</span>
            </Link>
          );
        })}

        <div style={{ position: 'relative', flex: 1 }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              borderRadius: 8,
              padding: '6px 0',
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '.01em',
              color: isOtherActive ? '#8b6b4f' : '#475569',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <NativeNavIcon icon="other" style={{ width: 16, height: 16 }} />
            <span style={isOtherActive ? { borderBottom: '2px solid #8b6b4f', paddingBottom: 1 } : undefined}>その他</span>
          </button>

          {open ? (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                bottom: '100%',
                marginBottom: 8,
                width: 132,
                borderRadius: 12,
                border: '1px solid #d9d2c6',
                background: '#f9f7f3',
                padding: 8,
                boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
              }}
            >
              {OTHER_NAV_LINKS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={`mobile-other-${item.href}`}
                    href={item.href}
                    style={{
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: active ? '#8b6b4f' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      textDecoration: 'none',
                    }}
                  >
                    <NativeNavIcon icon={item.icon} style={{ width: 16, height: 16 }} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </nav>,
    document.body
  );
}
