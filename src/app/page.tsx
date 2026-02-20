import SiteHomePage from '@/app/[site]/page';

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ driver?: string; horizon?: string; show?: string }>;
}) {
  return SiteHomePage({
    params: Promise.resolve({ site: 'a' }),
    searchParams
  });
}
