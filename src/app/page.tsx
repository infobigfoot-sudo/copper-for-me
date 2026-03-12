import TopNativePage from '@/components/TopNativePage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  return <TopNativePage />;
}
