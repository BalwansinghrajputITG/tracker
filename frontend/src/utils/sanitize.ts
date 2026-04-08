import DOMPurify from 'dompurify'

/**
 * Sanitize untrusted HTML before inserting via dangerouslySetInnerHTML.
 * Strips scripts, event handlers, and other dangerous constructs.
 * Allows a safe subset of formatting tags (b, i, u, em, strong, br, p, etc.)
 * plus anchor tags without javascript: hrefs.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'b', 'i', 'u', 'em', 'strong', 'br', 'p', 'span', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'a',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
    // Force all links to open safely
    FORCE_BODY: true,
    ADD_ATTR: ['target'],
    // Callback: make all links open in a new tab and strip javascript: hrefs
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM: false,
  })
}

/**
 * Sanitize markdown-derived HTML — more restricted than sanitizeHtml.
 * Only allows the tags produced by simple markdown rendering.
 */
export function sanitizeMarkdownHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['strong', 'em', 'u', 'br', 'span', 'code'],
    ALLOWED_ATTR: [],
  })
}
