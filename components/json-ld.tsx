import { SITE_URL } from "../libs/site";

function WebsiteJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "OmniKit",
    url: SITE_URL,
    description:
      "Free online developer tools that run entirely in your browser. JSON formatter, Base64 encoder, password generator, hash calculator, JWT debugger, and 45+ more utilities. No data sent to any server.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "OmniKit",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512x512.png`,
    sameAs: ["https://github.com/nickvore"],
    description: "Browser-based developer tools platform",
  };
}

export function buildToolSchemas(options: {
  name: string;
  description: string;
  path: string;
  faqItems?: { q: string; a: string }[];
  howToSteps?: { name: string; text: string }[];
  categoryName?: string;
  categoryPath?: string;
  sameAs?: string[];
}): object[] {
  const { name, description, path, faqItems, howToSteps, categoryName, categoryPath, sameAs } =
    options;
  const url = `${SITE_URL}${path}`;

  const schemas: object[] = [];

  const webApp: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["WebApplication", "SoftwareApplication"],
    name,
    description,
    url,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    browserRequirements: "Requires JavaScript. Requires HTML5.",
  };

  if (sameAs && sameAs.length > 0) {
    webApp.sameAs = sameAs;
  }

  schemas.push(webApp);

  const breadcrumbItems: object[] = [
    { "@type": "ListItem", position: 1, name: "OmniKit", item: SITE_URL },
  ];
  if (categoryName && categoryPath) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: categoryName,
      item: `${SITE_URL}${categoryPath}`,
    });
    breadcrumbItems.push({ "@type": "ListItem", position: 3, name, item: url });
  } else {
    breadcrumbItems.push({ "@type": "ListItem", position: 2, name, item: url });
  }

  schemas.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  });

  if (faqItems && faqItems.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }

  if (howToSteps && howToSteps.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name,
      description,
      step: howToSteps.map((step, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: step.name,
        text: step.text,
      })),
    });
  }

  return schemas;
}

export function buildCategorySchema(options: {
  name: string;
  description: string;
  path: string;
  tools: { name: string; url: string }[];
  faqItems?: { q: string; a: string }[];
}): object[] {
  const { name, description, path, tools, faqItems } = options;
  const url = `${SITE_URL}${path}`;

  const schemas: object[] = [];

  schemas.push({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
  });

  schemas.push({
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: tools.map((tool, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: tool.name,
      url: tool.url,
    })),
  });

  schemas.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OmniKit", item: SITE_URL },
      { "@type": "ListItem", position: 2, name, item: url },
    ],
  });

  if (faqItems && faqItems.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }

  return schemas;
}

export { WebsiteJsonLd };
