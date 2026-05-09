import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LayoutSemanticViewer from "./LayoutSemanticViewer";
import "./index.css";

const path = window.location.pathname.toLowerCase();
const isLayoutSemanticViewer = path.endsWith("/layout-semantic-viewer") || path === "/layout-semantic-viewer";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isLayoutSemanticViewer ? <LayoutSemanticViewer /> : <App />}
  </React.StrictMode>
);
