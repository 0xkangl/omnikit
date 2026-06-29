"use client";

import Link from "next/link";
import Layout from "./layout";
import { useLocale, useTranslations } from "next-intl";
import {
  TOOL_CATEGORIES,
  getToolCardMap,
  getToolCardsByKeys,
  getToolIconColor,
  type ToolCategory,
} from "../libs/tools";
import { Card } from "./ui/card";
import { Accordion } from "./ui/accordion";

export default function CategoryPage({ categoryKey }: { categoryKey: ToolCategory }) {
  const tc = useTranslations("categories");
  const t = useTranslations("tools");
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;

  const category = TOOL_CATEGORIES.find((c) => c.key === categoryKey)!;
  const cardMap = getToolCardMap(t);
  const tools = getToolCardsByKeys(category.tools, cardMap);

  const intro = tc.has(`${categoryKey}.intro`) ? tc(`${categoryKey}.intro`) : "";
  const faqItems = [1, 2, 3]
    .map((i) =>
      tc.has(`${categoryKey}.faq${i}Q`)
        ? { title: tc(`${categoryKey}.faq${i}Q`), content: <p>{tc(`${categoryKey}.faq${i}A`)}</p> }
        : null
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <Layout headerPosition="sticky">
      <section className="container mx-auto px-4 pt-6 pb-20">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-fg-primary tracking-tight">
          {tc(`${categoryKey}.shortTitle`)}
        </h1>

        {intro && <p className="mt-4 text-fg-secondary text-sm leading-relaxed">{intro}</p>}

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.path} href={`${prefix}${tool.path}`}>
                <Card hover className="group flex flex-col items-center cursor-pointer h-full">
                  <div className="flex flex-1 flex-col items-center p-2">
                    {Icon && (
                      <div
                        className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:brightness-110"
                        style={{ backgroundColor: `${getToolIconColor(tool.path)}15` }}
                      >
                        <Icon size={28} style={{ color: getToolIconColor(tool.path) }} />
                      </div>
                    )}
                    <h3 className="font-semibold text-fg-primary text-center">{tool.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-fg-secondary text-center leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {faqItems.length > 0 && (
          <div className="mt-12">
            <h2 className="text-base font-semibold text-fg-primary mb-4">FAQ</h2>
            <Accordion items={faqItems} />
          </div>
        )}
      </section>
    </Layout>
  );
}
