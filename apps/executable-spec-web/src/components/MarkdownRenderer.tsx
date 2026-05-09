import ReactMarkdown from "react-markdown";

type MarkdownRendererProps = {
  markdown: string;
};

export default function MarkdownRenderer(props: MarkdownRendererProps) {
  return <ReactMarkdown>{props.markdown}</ReactMarkdown>;
}

