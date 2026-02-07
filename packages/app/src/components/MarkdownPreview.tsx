import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface MarkdownPreviewProps {
  content: string;
  loading?: boolean;
}

export default function MarkdownPreview({ content, loading }: MarkdownPreviewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-2xl">⚡</div>
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-[var(--text-muted)] text-center py-16">
        <div className="text-4xl mb-2">📝</div>
        <div>Empty file</div>
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none
      prose-headings:text-[var(--text-primary)] prose-headings:border-b prose-headings:border-[var(--border-primary)] prose-headings:pb-2
      prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
      prose-p:text-[var(--text-secondary)] prose-p:leading-relaxed
      prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline
      prose-strong:text-[var(--text-primary)]
      prose-code:text-[var(--text-secondary)] prose-code:bg-[var(--bg-secondary)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:border prose-code:border-[var(--border-primary)]
      prose-pre:bg-[var(--bg-secondary)] prose-pre:border prose-pre:border-[var(--bg-tertiary)] prose-pre:rounded-[10px]
      prose-blockquote:border-[var(--border-secondary)] prose-blockquote:bg-[var(--bg-tertiary)] prose-blockquote:rounded-r
      prose-li:text-[var(--text-secondary)]
      prose-table:border-collapse
      prose-th:bg-[var(--bg-secondary)] prose-th:p-2 prose-th:border prose-th:border-[var(--border-primary)]
      prose-td:p-2 prose-td:border prose-td:border-[var(--border-primary)]
      prose-img:rounded-[10px]
      prose-hr:border-[var(--border-primary)]
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Custom checkbox rendering for task lists
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 accent-[var(--accent)]"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
