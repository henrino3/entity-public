interface MCFragmentProps {
  html: string;
  testId?: string;
}

export default function MCFragment({ html, testId }: MCFragmentProps) {
  return (
    <div
      data-testid={testId}
      data-mc-fragment={testId}
      style={{ display: 'contents' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
