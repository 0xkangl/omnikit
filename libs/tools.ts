import type { LucideIcon } from "lucide-react";
import type { useTranslations } from "next-intl";
import {
  FileJson,
  FileCode,
  FileCode2,
  FileBraces,
  ShieldCheck,
  Percent,
  FingerprintPattern,
  Regex,
  QrCode,
  Ruler,
  GitCompare,
  Hash,
  KeyRound,
  CaseSensitive,
  Crop,
  Lock,
  Clock,
  Timer,
  FileText,
  Database,
  FileCheck,
  HardDrive,
  Type,
  Code,
  Globe,
  Palette,
  Binary,
  Table,
  FileSpreadsheet,
  Scaling,
  FileDown,
  RefreshCw,
  RotateCw,
  ListFilter,
  Search,
  AlignLeft,
  Terminal,
  Send,
  Wallet,
  BookOpen,
  Network,
  FlaskConical,
  Layers,
  Scissors,
  FileStack,
  Droplets,
  Stamp,
  FileImage,
  ImageDown,
} from "lucide-react";

export interface ToolCard {
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
  searchTerms: string;
}

export interface ToolEntry {
  key: string;
  path: string;
  icon: LucideIcon;
  emoji: string;
  sameAs?: string[];
}

export type ToolCategory =
  | "text"
  | "encoding"
  | "security"
  | "generators"
  | "visual"
  | "reference"
  | "workflows";

export interface CategoryGroup {
  key: ToolCategory;
  tools: string[]; // tool keys in display order
}

export const CATEGORY_SLUGS: Record<ToolCategory, string> = {
  text: "text-processing",
  encoding: "encoding-conversion",
  security: "security-crypto",
  generators: "generators",
  visual: "visual-media",
  reference: "reference-lookup",
  workflows: "workflows",
};

export const TOOL_CATEGORIES: CategoryGroup[] = [
  {
    key: "text",
    tools: [
      "json",
      "sqlformat",
      "regex",
      "diff",
      "markdown",
      "textcase",
      "extractor",
      "wordcounter",
      "tokencounter",
      "deduplines",
    ],
  },
  {
    key: "encoding",
    tools: [
      "base64",
      "urlencoder",
      "jsonts",
      "csv",
      "csv-md",
      "numbase",
      "yaml",
      "storageunit",
      "cssunit",
    ],
  },
  {
    key: "security",
    tools: ["jwt", "hashing", "password", "sshkey", "wallet", "cipher", "checksum"],
  },
  { key: "generators", tools: ["uuid", "cron", "unixtime", "qrcode"] },
  {
    key: "visual",
    tools: [
      "color",
      "image-resize",
      "image-compress",
      "image-convert",
      "image-watermark",
      "image-crop",
      "image-rotate",
      "image-to-pdf",
      "pdf-to-image",
      "pdf-merge",
      "pdf-split",
      "pdf-compress",
      "pdf-watermark",
    ],
  },
  {
    key: "reference",
    tools: ["httpstatus", "httpclient", "dbviewer", "ascii", "htmlcode", "bip39", "subnet"],
  },
  { key: "workflows", tools: ["recipe", "batch"] },
];

export const QUICK_ACCESS_DEFAULT: string[] = ["json", "base64", "jwt", "regex", "diff", "hashing"];

export const TOOL_RELATIONS: Record<string, string[]> = {
  json: ["csv", "yaml", "diff", "regex", "recipe"],
  sqlformat: ["dbviewer", "json", "yaml"],
  base64: ["urlencoder", "hashing", "cipher", "recipe"],
  jwt: ["base64", "hashing", "password"],
  regex: ["json", "textcase", "diff"],
  uuid: ["password", "qrcode", "hashing"],
  hashing: ["checksum", "cipher", "base64", "jwt", "recipe"],
  urlencoder: ["base64", "numbase", "textcase"],
  unixtime: ["cron", "uuid"],
  diff: ["json", "regex", "csv"],
  password: ["jwt", "sshkey", "uuid", "hashing"],
  wallet: ["sshkey", "password", "hashing", "jwt", "bip39"],
  sshkey: ["password", "hashing", "jwt", "wallet"],
  color: [
    "image-resize",
    "image-compress",
    "image-convert",
    "numbase",
    "cssunit",
    "image-watermark",
  ],
  cron: ["unixtime", "regex"],
  markdown: ["json", "diff", "htmlcode"],
  qrcode: ["uuid", "urlencoder", "password"],
  textcase: ["regex", "extractor", "wordcounter"],
  deduplines: ["extractor", "textcase", "wordcounter"],
  csv: ["json", "yaml", "diff", "jsonts"],
  "csv-md": ["csv", "markdown", "json"],
  cipher: ["hashing", "base64", "password"],
  numbase: ["color", "storageunit", "ascii", "subnet"],
  dbviewer: ["csv", "json", "yaml", "sqlformat"],
  checksum: ["hashing", "cipher", "pdf-merge", "pdf-compress"],
  storageunit: ["numbase", "checksum", "cssunit"],
  httpstatus: ["httpclient", "urlencoder", "subnet"],
  yaml: ["json", "csv", "markdown", "jsonts"],
  jsonts: ["json", "csv", "yaml"],
  "image-crop": [
    "image-resize",
    "image-compress",
    "image-convert",
    "image-rotate",
    "image-watermark",
  ],
  "image-resize": [
    "image-compress",
    "image-convert",
    "image-crop",
    "image-rotate",
    "image-watermark",
    "image-to-pdf",
  ],
  "image-compress": [
    "image-resize",
    "image-convert",
    "image-crop",
    "image-rotate",
    "pdf-merge",
    "pdf-split",
    "pdf-compress",
    "image-watermark",
    "image-to-pdf",
    "pdf-to-image",
  ],
  "image-convert": [
    "image-resize",
    "image-compress",
    "image-crop",
    "image-rotate",
    "pdf-merge",
    "pdf-split",
    "pdf-compress",
    "image-watermark",
    "image-to-pdf",
    "pdf-to-image",
  ],
  "image-rotate": [
    "image-resize",
    "image-compress",
    "image-convert",
    "image-crop",
    "image-watermark",
  ],
  "image-watermark": [
    "image-resize",
    "image-compress",
    "image-convert",
    "image-crop",
    "image-rotate",
    "color",
    "pdf-watermark",
  ],
  htmlcode: ["ascii", "httpstatus", "markdown"],
  ascii: ["htmlcode", "numbase", "httpstatus", "subnet"],
  extractor: ["regex", "textcase", "deduplines"],
  wordcounter: ["textcase", "extractor", "deduplines", "tokencounter"],
  tokencounter: ["wordcounter", "regex", "textcase"],
  httpclient: ["httpstatus", "urlencoder", "json"],
  bip39: ["wallet", "password"],
  cssunit: ["storageunit", "numbase", "color"],
  subnet: ["numbase", "httpstatus", "ascii"],
  recipe: ["json", "base64", "hashing"],
  batch: ["recipe", "hashing", "base64", "image-resize", "image-compress"],
  "image-to-pdf": ["image-resize", "image-compress", "image-convert", "pdf-merge", "pdf-to-image"],
  "pdf-to-image": [
    "image-compress",
    "image-convert",
    "image-resize",
    "pdf-merge",
    "pdf-split",
    "image-to-pdf",
  ],
  "pdf-merge": [
    "pdf-split",
    "pdf-compress",
    "image-compress",
    "image-convert",
    "checksum",
    "pdf-watermark",
    "image-to-pdf",
    "pdf-to-image",
  ],
  "pdf-split": ["pdf-merge", "image-compress", "image-convert", "pdf-to-image"],
  "pdf-compress": ["pdf-merge", "image-compress", "checksum"],
  "pdf-watermark": ["image-watermark", "pdf-merge", "image-compress", "image-convert", "color"],
};

const PALETTE_SIZE = 20;

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return Math.abs(h);
}

export function getToolIconColor(path: string): string {
  const index = hashCode(path) % PALETTE_SIZE;
  return `var(--tool-icon-${index})`;
}

export const TOOLS: ToolEntry[] = [
  {
    key: "json",
    path: "/json",
    icon: FileJson,
    emoji: "{}",
    sameAs: ["https://www.json.org", "https://datatracker.ietf.org/doc/html/rfc8259"],
  },
  {
    key: "sqlformat",
    path: "/sqlformat",
    icon: FileCode,
    emoji: "🗃️",
    sameAs: ["https://en.wikipedia.org/wiki/SQL"],
  },
  {
    key: "jsonts",
    path: "/jsonts",
    icon: FileCode2,
    emoji: "🔷",
    sameAs: ["https://www.typescriptlang.org/"],
  },
  {
    key: "base64",
    path: "/base64",
    icon: FileCode,
    emoji: "🔢",
    sameAs: ["https://datatracker.ietf.org/doc/html/rfc4648"],
  },
  {
    key: "jwt",
    path: "/jwt",
    icon: ShieldCheck,
    emoji: "🔐",
    sameAs: [
      "https://datatracker.ietf.org/doc/html/rfc7519",
      "https://en.wikipedia.org/wiki/JSON_Web_Token",
    ],
  },
  {
    key: "regex",
    path: "/regex",
    icon: Regex,
    emoji: "🔍",
    sameAs: ["https://en.wikipedia.org/wiki/Regular_expression"],
  },
  {
    key: "uuid",
    path: "/uuid",
    icon: FingerprintPattern,
    emoji: "🆔",
    sameAs: [
      "https://datatracker.ietf.org/doc/html/rfc4122",
      "https://datatracker.ietf.org/doc/html/rfc9562",
    ],
  },
  {
    key: "hashing",
    path: "/hashing",
    icon: Hash,
    emoji: "#️⃣",
    sameAs: ["https://en.wikipedia.org/wiki/Cryptographic_hash_function"],
  },
  {
    key: "urlencoder",
    path: "/urlencoder",
    icon: Percent,
    emoji: "🔗",
    sameAs: ["https://developer.mozilla.org/en-US/docs/Glossary/percent-encoding"],
  },
  {
    key: "unixtime",
    path: "/unixtime",
    icon: Timer,
    emoji: "⏱️",
    sameAs: ["https://en.wikipedia.org/wiki/Unix_time"],
  },
  {
    key: "diff",
    path: "/diff",
    icon: GitCompare,
    emoji: "📄",
    sameAs: ["https://en.wikipedia.org/wiki/Diff_utility"],
  },
  {
    key: "password",
    path: "/password",
    icon: KeyRound,
    emoji: "🔑",
    sameAs: ["https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"],
  },
  {
    key: "sshkey",
    path: "/sshkey",
    icon: Terminal,
    emoji: "🖥️",
    sameAs: ["https://datatracker.ietf.org/doc/html/rfc4251"],
  },
  {
    key: "color",
    path: "/color",
    icon: Palette,
    emoji: "🎨",
    sameAs: ["https://www.w3.org/TR/css-color-4/"],
  },
  {
    key: "cron",
    path: "/cron",
    icon: Clock,
    emoji: "⏰",
    sameAs: ["https://en.wikipedia.org/wiki/Cron"],
  },
  {
    key: "markdown",
    path: "/markdown",
    icon: FileText,
    emoji: "📝",
    sameAs: ["https://commonmark.org/"],
  },
  {
    key: "qrcode",
    path: "/qrcode",
    icon: QrCode,
    emoji: "📱",
    sameAs: ["https://en.wikipedia.org/wiki/QR_code", "https://www.iso.org/standard/62021.html"],
  },
  { key: "textcase", path: "/textcase", icon: CaseSensitive, emoji: "🔤", sameAs: [] },
  { key: "deduplines", path: "/deduplines", icon: ListFilter, emoji: "🧹", sameAs: [] },
  {
    key: "csv",
    path: "/csv",
    icon: FileSpreadsheet,
    emoji: "📊",
    sameAs: ["https://datatracker.ietf.org/doc/html/rfc4180"],
  },
  {
    key: "csv-md",
    path: "/csv-md",
    icon: Table,
    emoji: "📋",
    sameAs: ["https://datatracker.ietf.org/doc/html/rfc4180"],
  },
  {
    key: "cipher",
    path: "/cipher",
    icon: Lock,
    emoji: "🔒",
    sameAs: ["https://en.wikipedia.org/wiki/Encryption"],
  },
  { key: "numbase", path: "/numbase", icon: Binary, emoji: "🔢", sameAs: [] },
  { key: "dbviewer", path: "/dbviewer", icon: Database, emoji: "🗄️", sameAs: [] },
  {
    key: "checksum",
    path: "/checksum",
    icon: FileCheck,
    emoji: "✅",
    sameAs: ["https://en.wikipedia.org/wiki/Checksum"],
  },
  { key: "storageunit", path: "/storageunit", icon: HardDrive, emoji: "💾", sameAs: [] },
  {
    key: "cssunit",
    path: "/cssunit",
    icon: Ruler,
    emoji: "📐",
    sameAs: ["https://www.w3.org/TR/css-values-4/"],
  },
  {
    key: "httpstatus",
    path: "/httpstatus",
    icon: Globe,
    emoji: "🌐",
    sameAs: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Status"],
  },
  { key: "yaml", path: "/yaml", icon: FileBraces, emoji: "📄", sameAs: ["https://yaml.org/spec/"] },
  { key: "image-resize", path: "/image-resize", icon: Scaling, emoji: "📐", sameAs: [] },
  { key: "image-compress", path: "/image-compress", icon: FileDown, emoji: "🗜️", sameAs: [] },
  { key: "image-convert", path: "/image-convert", icon: RefreshCw, emoji: "🔄", sameAs: [] },
  { key: "image-crop", path: "/image-crop", icon: Crop, emoji: "✂️", sameAs: [] },
  { key: "image-rotate", path: "/image-rotate", icon: RotateCw, emoji: "🔃", sameAs: [] },
  { key: "htmlcode", path: "/htmlcode", icon: Code, emoji: "🔖", sameAs: [] },
  {
    key: "ascii",
    path: "/ascii",
    icon: Type,
    emoji: "⌨️",
    sameAs: ["https://en.wikipedia.org/wiki/ASCII"],
  },
  { key: "extractor", path: "/extractor", icon: Search, emoji: "🔎", sameAs: [] },
  { key: "wordcounter", path: "/wordcounter", icon: AlignLeft, emoji: "📏", sameAs: [] },
  { key: "httpclient", path: "/httpclient", icon: Send, emoji: "📡", sameAs: [] },
  { key: "tokencounter", path: "/token-counter", icon: Hash, emoji: "🪙", sameAs: [] },
  {
    key: "wallet",
    path: "/wallet",
    icon: Wallet,
    emoji: "👛",
    sameAs: ["https://en.wikipedia.org/wiki/Cryptocurrency_wallet"],
  },
  {
    key: "bip39",
    path: "/bip39",
    icon: BookOpen,
    emoji: "📖",
    sameAs: ["https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki"],
  },
  {
    key: "subnet",
    path: "/subnet",
    icon: Network,
    emoji: "🧮",
    sameAs: [
      "https://datatracker.ietf.org/doc/html/rfc4632",
      "https://datatracker.ietf.org/doc/html/rfc4291",
      "https://en.wikipedia.org/wiki/Subnetwork",
    ],
  },
  {
    key: "recipe",
    path: "/recipe",
    icon: FlaskConical,
    emoji: "🧪",
    sameAs: ["https://gchq.github.io/CyberChef/"],
  },
  {
    key: "batch",
    path: "/batch",
    icon: Layers,
    emoji: "📦",
    sameAs: ["https://en.wikipedia.org/wiki/Batch_processing"],
  },
  {
    key: "pdf-merge",
    path: "/pdf-merge",
    icon: FileStack,
    emoji: "📑",
    sameAs: [
      "https://en.wikipedia.org/wiki/PDF",
      "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
    ],
  },
  {
    key: "pdf-split",
    path: "/pdf-split",
    icon: Scissors,
    emoji: "✂️",
    sameAs: ["https://www.adobe.com/acrobat/online/split-pdf.html"],
  },
  {
    key: "pdf-compress",
    path: "/pdf-compress",
    icon: FileText,
    emoji: "🗜️",
    sameAs: [
      "https://en.wikipedia.org/wiki/PDF",
      "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
    ],
  },
  {
    key: "image-watermark",
    path: "/image-watermark",
    icon: Droplets,
    emoji: "💧",
    sameAs: [],
  },
  {
    key: "pdf-watermark",
    path: "/pdf-watermark",
    icon: Stamp,
    emoji: "🔏",
    sameAs: ["https://en.wikipedia.org/wiki/Watermark"],
  },
  {
    key: "image-to-pdf",
    path: "/image-to-pdf",
    icon: FileImage,
    emoji: "🖼️",
    sameAs: [
      "https://en.wikipedia.org/wiki/PDF",
      "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
    ],
  },
  {
    key: "pdf-to-image",
    path: "/pdf-to-image",
    icon: ImageDown,
    emoji: "📄",
    sameAs: ["https://www.adobe.com/acrobat/online/pdf-to-image.html"],
  },
];

export const TOOL_PATHS = new Set(TOOLS.map((t) => t.path));

export function getToolCategory(toolKey: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((c) => c.tools.includes(toolKey))?.key;
}

export function getToolCards(t: ReturnType<typeof useTranslations>): ToolCard[] {
  return TOOLS.map((tool) => ({
    path: tool.path,
    title: t(`${tool.key}.shortTitle`),
    description: t(`${tool.key}.description`),
    icon: tool.icon,
    searchTerms: t.has(`${tool.key}.searchTerms`) ? t(`${tool.key}.searchTerms`) : "",
  }));
}

export function getToolCardMap(t: ReturnType<typeof useTranslations>): Map<string, ToolCard> {
  const cards = getToolCards(t);
  return new Map(cards.map((card) => [card.path, card]));
}

const TOOL_KEY_TO_PATH = new Map(TOOLS.map((t) => [t.key, t.path]));

export function getToolCardsByKeys(keys: string[], cardMap: Map<string, ToolCard>): ToolCard[] {
  return keys
    .map((key) => {
      const path = TOOL_KEY_TO_PATH.get(key) ?? `/${key}`;
      return cardMap.get(path);
    })
    .filter((card): card is ToolCard => card !== undefined);
}
