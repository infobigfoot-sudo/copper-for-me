export default function SiteLoading() {
  return (
    <div className="cf-page-loading" aria-live="polite" aria-busy="true">
      <div className="cf-page-loading-inner">
        <div className="cf-spinner" />
        <p>データ更新中…</p>
      </div>
    </div>
  );
}

