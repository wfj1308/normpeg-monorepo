import { useMemo, useState } from "react";
import SPUApp from "./SPUApp";
import RuntimeEventCenter from "./RuntimeEventCenter";
import ProofViewer from "./ProofViewer";
import ProjectComplianceDashboard from "./ProjectComplianceDashboard";
import BIMRuntimeLinkagePage from "./BIMRuntimeLinkagePage";
import LiveRiskBoard from "./LiveRiskBoard";
import EngineeringCopilotConsole from "./EngineeringCopilotConsole";
import BodyCenter from "./BodyCenter";

type TwinSectionKey =
  | "norm_library"
  | "runtime_center"
  | "compliance_dashboard"
  | "bim_twin"
  | "proof_center"
  | "risk_center"
  | "copilot"
  | "body_center";

type TwinNavItem = {
  key: TwinSectionKey;
  title: string;
  subtitle: string;
};

const NAV_ITEMS: TwinNavItem[] = [
  { key: "norm_library", title: "Norm Library", subtitle: "规范 / SpecIR / Rulepack" },
  { key: "runtime_center", title: "Runtime Center", subtitle: "Runtime Events / Gate Results / Proof" },
  { key: "compliance_dashboard", title: "Compliance Dashboard", subtitle: "项目合规状态" },
  { key: "bim_twin", title: "BIM Twin", subtitle: "BIM 构件规范联动" },
  { key: "proof_center", title: "Proof Center", subtitle: "证据链 / 审计报告" },
  { key: "risk_center", title: "Risk Center", subtitle: "风险预测 / 高频失败规则" },
  { key: "copilot", title: "Copilot", subtitle: "规范问答 / 合规解释" },
  { key: "body_center", title: "Body Center", subtitle: "Current Value / Source / Confidence" },
];

function readInitialSection(): TwinSectionKey {
  const q = new URLSearchParams(window.location.search);
  const section = String(q.get("section") ?? "").trim().toLowerCase();
  const matched = NAV_ITEMS.find((item) => item.key === section);
  return matched?.key ?? "norm_library";
}

function syncSectionToUrl(section: TwinSectionKey): void {
  const next = new URL(window.location.href);
  next.searchParams.set("section", section);
  window.history.replaceState({}, "", `${next.pathname}${next.search}${next.hash}`);
}

function SectionTraceabilityBar(props: { section: TwinSectionKey }) {
  const { section } = props;
  const title = NAV_ITEMS.find((item) => item.key === section)?.title ?? section;
  const links = [
    { label: "SpecIR Graph", href: "/knowledge-graph-explorer" },
    { label: "Norm / SpecIR Upgrade", href: "/norm-update-center" },
    { label: "Runtime->Proof Trace", href: "/proof-viewer" },
    { label: "Project Compliance", href: "/project-compliance-dashboard" },
    { label: "BIM Runtime Linkage", href: "/bim-runtime-linkage" },
    { label: "Body Center", href: "/body-center" },
    { label: "Gate Runtime Panel", href: "/gate-runtime-panel" },
    { label: "Input Pipeline Viewer", href: "/input-pipeline-viewer" },
    { label: "Runtime Trace", href: "/runtime-trace" },
    { label: "Live Runtime Center", href: "/live-runtime-center" },
    { label: "Engineering Reasoning Panel", href: "/engineering-reasoning-panel" },
    { label: "Causal Explorer", href: "/causal-explorer" },
    { label: "Runtime Anomaly Center", href: "/runtime-anomaly-center" },
    { label: "Predictive Risk Dashboard", href: "/predictive-risk-dashboard" },
    { label: "Runtime Memory Explorer", href: "/runtime-memory-explorer" },
    { label: "Remediation Planner", href: "/remediation-planner" },
    { label: "Project Semantic Brain Dashboard", href: "/project-semantic-brain-dashboard" },
    { label: "Copilot Workspace", href: "/copilot-workspace" },
    { label: "Compliance Intelligence Center", href: "/compliance-intelligence-center" },
    { label: "Knowledge Compression Dashboard", href: "/knowledge-compression-dashboard" },
    { label: "Cross-Project Intelligence Center", href: "/cross-project-intelligence-center" },
    { label: "Dependency Impact Viewer", href: "/dependency-impact-viewer" },
    { label: "Live Compliance Board", href: "/live-compliance-board" },
    { label: "Semantic Consistency Report", href: "/semantic-consistency-report" },
    { label: "Runtime Semantic Explorer", href: "/runtime-semantic-explorer" },
    { label: "Body Timeline", href: "/body-timeline" },
    { label: "Trust Dashboard", href: "/trust-dashboard" },
    { label: "Gate Runtime Trace", href: "/gate-runtime-trace" },
    { label: "Proof Chain Viewer", href: "/proof-chain-viewer" },
    { label: "Live Conclusion Board", href: "/live-conclusion-board" },
    { label: "Replay Studio", href: "/replay-studio" },
  ];
  return (
    <div style={{ border: "1px solid #d0d7de", background: "#f6f8fa", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>SpecIR Traceability Path: {title}</div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        当前页面已纳入 Engineering Semantic Twin 链路，可追溯到 SpecIR / Rulepack / Runtime / Proof。
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {links.map((item) => (
          <a key={item.href} href={item.href} style={{ fontSize: 12, textDecoration: "none", border: "1px solid #b6c2cf", borderRadius: 999, padding: "4px 10px", color: "#1f2328", background: "#fff" }}>
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function renderSection(section: TwinSectionKey) {
  switch (section) {
    case "norm_library":
      return <SPUApp />;
    case "runtime_center":
      return <RuntimeEventCenter />;
    case "compliance_dashboard":
      return <ProjectComplianceDashboard />;
    case "bim_twin":
      return <BIMRuntimeLinkagePage />;
    case "proof_center":
      return <ProofViewer />;
    case "risk_center":
      return <LiveRiskBoard />;
    case "copilot":
      return <EngineeringCopilotConsole />;
    case "body_center":
      return <BodyCenter />;
    default:
      return <SPUApp />;
  }
}

export default function EngineeringSemanticTwinMode() {
  const [section, setSection] = useState<TwinSectionKey>(readInitialSection());
  const quickLinkSection = useMemo(() => {
    if (section === "runtime_center") return "proof_center";
    if (section === "proof_center") return "bim_twin";
    if (section === "bim_twin") return "compliance_dashboard";
    if (section === "compliance_dashboard") return "body_center";
    return "runtime_center";
  }, [section]);

  function switchSection(next: TwinSectionKey) {
    setSection(next);
    syncSectionToUrl(next);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", minHeight: "100vh", background: "linear-gradient(145deg,#f5f7fb,#eef3f9)" }}>
      <aside style={{ borderRight: "1px solid #d8dee4", padding: 16, background: "#ffffffcc", backdropFilter: "blur(6px)" }}>
        <h2 style={{ margin: "4px 0 12px 0" }}>Engineering Semantic Twin</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#57606a" }}>
          Norm Library 不再孤立，Runtime / Proof / BIM / Project / Body 统一联动。
        </p>
        <nav style={{ display: "grid", gap: 8 }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === section;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => switchSection(item.key)}
                style={{
                  textAlign: "left",
                  borderRadius: 10,
                  border: active ? "1px solid #1f6feb" : "1px solid #d0d7de",
                  background: active ? "#eaf2ff" : "#fff",
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#57606a" }}>{item.subtitle}</div>
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: 14, borderTop: "1px dashed #d8dee4", paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: "#57606a", marginBottom: 6 }}>Twin 联动快捷跳转</div>
          <button
            type="button"
            onClick={() => switchSection(quickLinkSection)}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #8c959f", background: "#fff", padding: "8px 10px", cursor: "pointer", fontSize: 12 }}
          >
            Go to {NAV_ITEMS.find((item) => item.key === quickLinkSection)?.title}
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <a href="/knowledge-graph-explorer" style={{ fontSize: 12, color: "#0969da", textDecoration: "none" }}>
            每个页面都可追溯到 SpecIR
          </a>
        </div>
      </aside>
      <main style={{ padding: 16 }}>
        <SectionTraceabilityBar section={section} />
        {renderSection(section)}
      </main>
    </div>
  );
}
