

import type { Post } from '@/types/cms';

export default function ArticleCard({ post }: { post: Post }) {
  return (
    <article className="article-card">
      <p className="article-card__meta">{new Date(post.publishedAt).toLocaleDateString('ja-JP')}</p>
      <h2 className="article-card__title">
        <a href={`/blog/${post.slug}`}>{post.title}</a>
      </h2>
      {post.excerpt ? <p className="article-card__excerpt">{post.excerpt}</p> : null}
      <p className="article-card__tags">
        {(post.tags || []).slice(0, 3).map((tag) => (
          <a key={tag.id} href={`/tag/${tag.slug}`}>
            #{tag.name}
          </a>
        ))}
      </p>
    </article>
  );
}
