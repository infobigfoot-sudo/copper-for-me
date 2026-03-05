import Link from 'next/link';

import NativePageShell from '@/components/native/NativePageShell';
import { SectionCard } from '@/components/native/NativeWidgets';

export default async function ExplanationPage() {
  return (
    <NativePageShell active="article" title="銅価格の見方" description="LME・為替・在庫の3点から、仕入れ/在庫/売値判断の基本を整理。">
      <SectionCard title="基本の見方">
        <div className="space-y-4 text-sm text-cool-grey">
          <p>1. LME銅価格（USD/mt）の方向を確認</p>
          <p>2. USD/JPY を重ねて国内建値への波及を確認</p>
          <p>3. Warrant / off-warrant 在庫で需給バランスを確認</p>
        </div>
      </SectionCard>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <SectionCard title="LME">
          <Link href="/lme" className="text-positive text-sm font-bold hover:underline">LMEページへ ↗</Link>
        </SectionCard>
        <SectionCard title="建値">
          <Link href="/tatene" className="text-positive text-sm font-bold hover:underline">建値ページへ ↗</Link>
        </SectionCard>
        <SectionCard title="供給と需要">
          <Link href="/supply-chain" className="text-positive text-sm font-bold hover:underline">供給と需要ページへ ↗</Link>
        </SectionCard>
      </div>
    </NativePageShell>
  );
}
