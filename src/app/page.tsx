import TopNativePage from '@/components/TopNativePage';

export const revalidate = 300;

export default async function HomePage() {
  return <TopNativePage />;
}
