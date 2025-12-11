# LASCSS IntelliSense

VS Code IntelliSense for LASCSS utility classes with color details and variant support.

## Features
- IntelliSense for LASCSS classes and variants (`md:bg-red-500`, `hover:text-...`).
- Color shades shown in detail (hex/rgb) with a small swatch preview.
- Utility classes show their first CSS declaration in detail.
- Supports slash/bracket utilities (`w-1/2`, `bg-[var(--...)]`).
- Languages: html, css, scss, sass, less, stylus, postcss, js/ts + react, vue, svelte, astro, angular (always available via Ctrl+Space).

## Demo
Add your gif here after setting a repository URL in `package.json` (Marketplace requires https):

![LASCSS IntelliSense demo](https://github.com/serdargoleli/las-intellisense/blob/main/images/demo.gif?raw=true)

## Installation
1) Ensure `lascss` is installed in your project (e.g., `pnpm add -D lascss`).  
2) Install/enable the extension in VS Code within the workspace.  
3) The extension expects `node_modules/lascss/dist/meta.min.css` and `utility.min.css`; if missing you’ll get a warning.

## Usage
- Auto-triggers after `-`, `:`, or space; you can always press `Ctrl+Space`.
- Type `md:` / `lg:` / `hover:` etc. to see variant suggestions, then pick a class.
- Color classes show color code + swatch; utility classes show the relevant CSS declaration.

## Notes
- Caching is in-memory; files are re-parsed when you reopen the workspace.
- Shade values are derived from meta: if per-shade values exist they’re used, otherwise shades are mixed from the base color.
