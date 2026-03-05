import type { ReactNode } from 'react';

export default function TopNativeTheme({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f7f3ec] via-[#efe7dc] to-[#f9f6f0] text-[#0f172a]">
      {children}
    </div>
  );
}
