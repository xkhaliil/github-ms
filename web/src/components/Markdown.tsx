import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Renders generated Markdown. The content is model-written and user-edited, so it
 * is sanitised before it ever reaches innerHTML - a README is allowed to contain
 * raw HTML, and that is exactly why it cannot be trusted verbatim.
 */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false, gfm: true, breaks: false });
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [source]);

  if (!source.trim()) {
    return <p className="text-sm text-ink-400">Nothing to preview yet.</p>;
  }

  return (
    <div
      className="markdown-body text-sm text-ink-100"
      // Sanitised immediately above; this is the only place raw HTML is injected.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
