export interface ModuleSectionMeta {
  id: string;
  title: string;
  description: string;
  source: string;
}

export const BUILDER_SECTIONS: ModuleSectionMeta[] = [
  {
    id: "template-library",
    title: "Spec Template Library",
    description: "Create and register specs from templates.",
    source: "src/components/SpecTemplateLibraryPanel.tsx",
  },
  {
    id: "pdf-to-markdown",
    title: "PDF to Markdown Draft",
    description: "Parse PDF, review draft, then register spec.",
    source: "src/components/PDFToMarkdownDraftPanel.tsx",
  },
  {
    id: "markdown-import",
    title: "Markdown Import",
    description: "Import markdown and compile/register directly.",
    source: "src/components/MarkdownSpecImportPanel.tsx",
  },
  {
    id: "specbundle-import",
    title: "Specbundle Import",
    description: "Import .specbundle/.zip artifacts as advanced bootstrap.",
    source: "src/SPUApp.tsx#resource-import",
  },
];
