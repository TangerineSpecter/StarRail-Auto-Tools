/** Fixed app viewport; scrolling remains available, page magnification does not. */
export function mobileEntryHtml(html: string): string {
  return html
    .replace(
      'content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
      'content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"',
    )
    .replace(
      'content="width=device-width, initial-scale=1.0"',
      'content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"',
    )
    .replace("/src/main.ts", "/src/mobile/main.ts");
}
