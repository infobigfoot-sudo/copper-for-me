export default function RootLoading() {
  return (
    <div
      className="min-h-screen w-full bg-gradient-to-br from-[#f7f3ec] via-[#efe7dc] to-[#f9f6f0] text-off-white flex items-center justify-center"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-[#8b6b4f]/25 border-t-[#8b6b4f] animate-spin" />
        <p className="text-sm text-cool-grey">データ更新中…</p>
      </div>
    </div>
  );
}
