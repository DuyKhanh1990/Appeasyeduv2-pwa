const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files within the monorepo so Metro can find assets
// (font files, images, etc.) that live in pnpm's hoisted node_modules
config.watchFolders = [workspaceRoot];

// Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Exclude volatile directories that get created/deleted at runtime.
// Metro's FallbackWatcher crashes with ENOENT if it picks up a path
// that disappears while it's still setting up the watcher.
const blockList = config.resolver.blockList;
const blockPatterns = [
  // Replit agent temp files (.local/skills/.tmp-*, canvas assets, etc.)
  /[/\\]\.local[/\\]/,
  /[/\\]\.canvas[/\\]/,
  /[/\\]\.agents[/\\]/,
  /[/\\]\.cache[/\\]/,
  /[/\\]\.git[/\\]/,
];

config.resolver.blockList = blockList
  ? Array.isArray(blockList)
    ? [...blockList, ...blockPatterns]
    : [blockList, ...blockPatterns]
  : blockPatterns;

// Replace fontfaceobserver with a no-op mock to prevent 6000ms timeout errors on web
// Also explicitly resolve @tiptap/* packages used by CommentRichEditor.web.tsx,
// since they are transitive deps and Metro cannot find them via nodeModulesPaths alone.
const pnpmStore = path.resolve(workspaceRoot, "node_modules/.pnpm");
const tiptapReactDir = require("fs")
  .readdirSync(pnpmStore)
  .find((d) => d.startsWith("@tiptap+react@"));
const tiptapStarterKitDir = require("fs")
  .readdirSync(pnpmStore)
  .find((d) => d.startsWith("@tiptap+starter-kit@"));
const tiptapImageDir = require("fs")
  .readdirSync(pnpmStore)
  .find((d) => d.startsWith("@tiptap+extension-image@"));

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  fontfaceobserver: path.resolve(projectRoot, "lib/fontfaceobserver-mock.js"),
  ...(tiptapReactDir && {
    "@tiptap/react": path.resolve(pnpmStore, tiptapReactDir, "node_modules/@tiptap/react"),
  }),
  ...(tiptapStarterKitDir && {
    "@tiptap/starter-kit": path.resolve(pnpmStore, tiptapStarterKitDir, "node_modules/@tiptap/starter-kit"),
  }),
  ...(tiptapImageDir && {
    "@tiptap/extension-image": path.resolve(pnpmStore, tiptapImageDir, "node_modules/@tiptap/extension-image"),
  }),
};

// Map react-native-pdf → no-op stub on web (native PDF engine không chạy trên web;
// FileViewer.web.tsx xử lý PDF bằng Google Docs Viewer iframe thay thế).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-pdf") {
    return {
      filePath: path.resolve(projectRoot, "lib/react-native-pdf-web-stub.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
