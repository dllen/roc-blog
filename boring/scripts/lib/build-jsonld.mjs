// Pure JSON-LD builders. Output objects are JSON-serializable.

export function buildBlogPostingJsonLd(post, site) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.date,
    dateModified: post.updateDate || post.date,
    description: post.description,
    keywords: tags.join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.url },
    author: { '@type': 'Person', name: 'roc', url: site.url },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
    isPartOf: post.seriesName ? {
      '@type': 'CreativeWorkSeries',
      name: post.seriesName,
      hasPart: (post.seriesUrls || []).map(u => ({ '@type': 'BlogPosting', url: u })),
    } : undefined,
  };
}

export function buildBreadcrumbJsonLd({ home, sections, current }) {
  const items = [
    { name: home.name, url: home.url },
    ...sections,
    current,
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function buildOrganizationJsonLd(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.url,
    description: site.description,
  };
}

export function buildWebSiteJsonLd(site, searchUrlTemplate) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
    description: site.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: site.url + searchUrlTemplate,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildCollectionPageJsonLd(section, site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: section.name,
    description: section.description,
    url: section.url,
    isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
    hasPart: (section.pages || []).map(p => ({
      '@type': 'BlogPosting',
      name: p.name,
      url: site.url + p.url,
    })),
  };
}
