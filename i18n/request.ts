import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

const namespaces = [
  "common",
  "tools",
  "categories",
  "home",
  "password",
  "hashing",
  "json",
  "base64",
  "ascii",
  "htmlcode",
  "checksum",
  "cipher",
  "storageunit",
  "terms",
  "privacy",
  "uuid",
  "urlencoder",
  "yaml",
  "diff",
  "markdown",
  "pwa",
  "dbviewer",
  "jwt",
  "unixtime",
  "cron",
  "qrcode",
  "textcase",
  "color",
  "httpstatus",
  "regex",
  "csv",
  "csv-md",
  "numbase",
  "image-resize",
  "image-compress",
  "image-convert",
  "image-crop",
  "image-rotate",
  "extractor",
  "wordcounter",
  "deduplines",
  "sshkey",
  "httpclient",
  "token-counter",
  "wallet",
  "bip39",
  "jsonts",
  "cssunit",
  "subnet",
  "sqlformat",
  "recipe",
  "batch",
  "pdf-compress",
  "pdf-merge",
  "pdf-split",
  "image-watermark",
];

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const messages: Record<string, unknown> = {};
  for (const ns of namespaces) {
    messages[ns] = (await import(`../public/locales/${locale}/${ns}.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
