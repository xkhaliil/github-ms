import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { currentJob } from "./lib/jobs.js";
import "./index.css";

/**
 * The run happens in this tab, so closing it stops the run. Generation costs real
 * money and a half-finished apply is worth knowing about, so ask first. Repos
 * already finished are saved and are not lost either way.
 */
window.addEventListener("beforeunload", (event) => {
  if (!currentJob()) return;
  event.preventDefault();
  // Browsers show their own wording; assigning returnValue is what triggers it.
  event.returnValue = "";
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
