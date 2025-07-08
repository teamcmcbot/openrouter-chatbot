const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: "./",
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@/components/(.*)$": "<rootDir>/components/$1",
    "^@/hooks/(.*)$": "<rootDir>/hooks/$1",
    "^@/lib/(.*)$": "<rootDir>/lib/$1",
    "^react-markdown$": "<rootDir>/__mocks__/react-markdown.js",
    "^remark-gfm$": "<rootDir>/__mocks__/remark-gfm.js",
    "^rehype-highlight$": "<rootDir>/__mocks__/rehype-highlight.js",
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-markdown|remark-gfm|rehype-highlight|unified|bail|is-plain-obj|trough|vfile|unist-util-stringify-position|micromark|decode-named-character-reference|character-entities|mdast-util-from-markdown|mdast-util-to-markdown|micromark-util-combine-extensions|micromark-util-chunked|micromark-util-character|micromark-util-classify-character|micromark-util-encode|micromark-util-html-tag-name|micromark-util-normalize-identifier|micromark-util-resolve-all|micromark-util-sanitize-uri|micromark-util-subtokenize|micromark-util-symbol|micromark-util-types|micromark-extension-gfm|micromark-extension-gfm-autolink-literal|micromark-extension-gfm-footnote|micromark-extension-gfm-strikethrough|micromark-extension-gfm-table|micromark-extension-gfm-tagfilter|micromark-extension-gfm-task-list-item|mdast-util-gfm|mdast-util-gfm-autolink-literal|mdast-util-gfm-footnote|mdast-util-gfm-strikethrough|mdast-util-gfm-table|mdast-util-gfm-task-list-item|mdast-util-find-and-replace|mdast-util-to-string|rehype-highlight|hast-util-highlight|@wooorm/starry-night|hastscript|hast-util-from-parse5|hast-util-to-parse5|hast-util-parse-selector|hast-util-whitespace|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|html-void-elements|ccount|escape-string-regexp|unist-util-is|unist-util-position|unist-util-position-from-estree|unist-util-remove-position|unist-util-stringify-position|unist-util-visit|unist-util-visit-parents|zwitch|longest-streak|mdast-util-to-hast|trim-lines|mdast-util-definitions|mdast-util-generated|unist-util-generated|mdast-util-phrasing|mdast-util-to-nlcst|parse-entities|character-entities-html4|character-entities-legacy|nlcst-to-string|is-alphabetical|is-alphanumerical|is-decimal|is-hexadecimal|is-whitespace-character|is-word-character|parse-latin|unist-util-modify-children|unist-util-visit-children|nlcst-to-string)/)",
  ],
  collectCoverageFrom: [
    "components/**/*.{js,jsx,ts,tsx}",
    "hooks/**/*.{js,jsx,ts,tsx}",
    "lib/**/*.{js,jsx,ts,tsx}",
    "src/**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
