import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = (process.env.APP_BASE_URL ?? 'https://ajudar.charity').replace(/\/$/, '')
  return [{
    url: origin + '/micaela',
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1,
  }]
}
