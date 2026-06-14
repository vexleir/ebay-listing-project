import type { ShopifyProduct, ShopifySEOScore } from '../types';

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function computeShopifySEOScore(product: ShopifyProduct): ShopifySEOScore {
  const title = product.title || '';
  const descPlain = stripHtml(product.descriptionHtml || '');
  const seoTitle = (product.seo?.title || '').trim();
  const seoDescription = (product.seo?.description || '').trim();
  const tags = product.tags || [];

  // Title length — 50-70 chars ideal (0-25)
  let titleLength = 0;
  const titleLen = title.length;
  if (titleLen >= 50 && titleLen <= 70) titleLength = 25;
  else if (titleLen >= 40 && titleLen <= 80) titleLength = 18;
  else if (titleLen >= 20) titleLength = 10;
  else if (titleLen > 0) titleLength = 3;

  // Description length — >300 plain chars ideal (0-25)
  let descriptionLength = 0;
  const dLen = descPlain.length;
  if (dLen >= 300) descriptionLength = 25;
  else if (dLen >= 100) descriptionLength = 12;
  else if (dLen > 0) descriptionLength = 4;

  // SEO meta title present (0-20)
  const hasSeoTitle = seoTitle.length > 0 ? 20 : 0;

  // SEO meta description present (0-20)
  const hasSeoDescription = seoDescription.length > 0 ? 20 : 0;

  // Tags (0-10)
  let tagCount = 0;
  if (tags.length >= 3) tagCount = 10;
  else if (tags.length >= 1) tagCount = 5;

  const total = titleLength + descriptionLength + hasSeoTitle + hasSeoDescription + tagCount;

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (total >= 85) grade = 'A';
  else if (total >= 70) grade = 'B';
  else if (total >= 55) grade = 'C';
  else if (total >= 40) grade = 'D';
  else grade = 'F';

  return {
    total,
    grade,
    breakdown: {
      titleLength,
      descriptionLength,
      hasSeoTitle,
      hasSeoDescription,
      tagCount,
    },
  };
}
