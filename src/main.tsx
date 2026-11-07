import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Control } from "./Control";
import { Output } from "./Output";
import "./App.css";

const label = getCurrentWebviewWindow().label;
const View = label === "output" ? Output : Control;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <View />
  </React.StrictMode>,
);
