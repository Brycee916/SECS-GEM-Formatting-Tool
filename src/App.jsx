import { useEffect, useState } from "react";
import {
  countItems,
  countItemsWithExplicitCounts,
  formatParsed,
  parseMessage
} from "./formatterCore";

const sampleMessage = `<L <A "PP-SELECT"> <L <U4 1001> <BOOLEAN TRUE> <F8 1.5 2.75 4.0> > <L [2] <A [4] "DONE"> <B [3] 0x01 0x0A 0xFF> > >`;

const defaultStatus = {
  tone: "ok",
  message: "Ready. Paste a SECS/GEM message and format it."
};

function getIndentUnit(mode) {
  if (mode === "spaces-2") {
    return "  ";
  }

  if (mode === "spaces-4") {
    return "    ";
  }

  return "\t";
}

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [outputMode, setOutputMode] = useState("preserve");
  const [indentMode, setIndentMode] = useState("tabs");
  const [compactScalars, setCompactScalars] = useState(false);
  const [status, setStatus] = useState(defaultStatus);

  function formatMessage(targetMode = outputMode, nextInput = input) {
    const raw = nextInput.trim();

    if (!raw) {
      setOutput("");
      setStatus({
        tone: "ok",
        message: "Nothing to format yet. Paste a SECS/GEM message first."
      });
      return;
    }

    try {
      const parsed = parseMessage(raw);
      const formatted = formatParsed(parsed, {
        mode: targetMode,
        indentUnit: getIndentUnit(indentMode),
        compactScalars
      });

      const countedItems = countItemsWithExplicitCounts(parsed);
      const totalItems = countItems(parsed);
      const modeLabel =
        targetMode === "with-counts"
          ? "count markers added"
          : targetMode === "without-counts"
            ? "count markers removed"
            : "input count style preserved";

      setOutput(formatted);
      setStatus({
        tone: "ok",
        message: `Formatted ${totalItems} item(s); ${countedItems} had explicit count markers in the source, and the output was rendered with ${modeLabel}.`
      });
    } catch (error) {
      setOutput("");
      setStatus({
        tone: "error",
        message: error.message
      });
    }
  }

  useEffect(() => {
    if (input.trim()) {
      formatMessage(outputMode, input);
    } else {
      setOutput("");
      setStatus(defaultStatus);
    }
  }, [outputMode, indentMode, compactScalars]);

  async function copyOutput() {
    if (!output.trim()) {
      setStatus({
        tone: "error",
        message: "There is no output to copy yet."
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setStatus({
        tone: "ok",
        message: "Formatted output copied to the clipboard."
      });
    } catch {
      setStatus({
        tone: "error",
        message: "Clipboard access failed. You can still select and copy the output manually."
      });
    }
  }

  function loadSample() {
    setInput(sampleMessage);
    formatMessage(outputMode, sampleMessage);
  }

  function clearInput() {
    setInput("");
    setOutput("");
    setStatus({
      tone: "ok",
      message: "Input cleared."
    });
  }

  function clearOutput() {
    setOutput("");
    setStatus({
      tone: "ok",
      message: "Output cleared."
    });
  }

  function useOutputAsInput() {
    if (!output.trim()) {
      setStatus({
        tone: "error",
        message: "There is no formatted output to move back into the input."
      });
      return;
    }

    setInput(output);
    setStatus({
      tone: "ok",
      message: "Output moved back into the input editor."
    });
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">SECS/GEM Utility</p>
          <h1>Format raw SECS/GEM text into a clean, readable structure.</h1>
          <p className="hero-text">
            Paste compact or messy SECS/GEM messages, normalize indentation, and translate between
            formats with datatype count markers like <code>[3]</code> and messages without them.
          </p>
        </div>

        <div className="hero-card">
          <div className="stat">
            <span className="stat-label">Handles</span>
            <strong>Counted + Uncounted</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Output</span>
            <strong>Tabs + Spacing</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Conversion</span>
            <strong>Add / Remove Counts</strong>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="panel controls-panel">
          <div className="section-heading">
            <h2>Formatter Controls</h2>
            <p>Choose how the output should be rendered.</p>
          </div>

          <div className="controls-grid">
            <label className="control">
              <span>Output mode</span>
              <select value={outputMode} onChange={(event) => setOutputMode(event.target.value)}>
                <option value="preserve">Preserve input count style</option>
                <option value="with-counts">Add count markers</option>
                <option value="without-counts">Remove count markers</option>
              </select>
            </label>

            <label className="control">
              <span>Indentation</span>
              <select value={indentMode} onChange={(event) => setIndentMode(event.target.value)}>
                <option value="tabs">Tabs</option>
                <option value="spaces-2">2 spaces</option>
                <option value="spaces-4">4 spaces</option>
              </select>
            </label>

            <label className="control checkbox-control">
              <input
                type="checkbox"
                checked={compactScalars}
                onChange={(event) => setCompactScalars(event.target.checked)}
              />
              <span>Collapse simple child items onto one line</span>
            </label>
          </div>

          <div className="button-row">
            <button className="primary" onClick={() => formatMessage(outputMode)}>
              Format Message
            </button>
            <button onClick={() => formatMessage("with-counts")}>Convert to Counted</button>
            <button onClick={() => formatMessage("without-counts")}>Convert to Uncounted</button>
            <button onClick={useOutputAsInput}>Use Output as Input</button>
          </div>
        </section>

        <section className="editor-grid">
          <article className="panel">
            <div className="section-heading">
              <h2>Input</h2>
              <p>Paste one or more SECS/GEM items.</p>
            </div>
            <textarea
              spellCheck="false"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder='<L [2] <A [5] "START"> <U4 [3] 100 200 300> >'
            />
            <div className="button-row small">
              <button onClick={loadSample}>Load Sample</button>
              <button onClick={clearInput}>Clear</button>
            </div>
          </article>

          <article className="panel">
            <div className="section-heading">
              <h2>Output</h2>
              <p>Formatted and converted result.</p>
            </div>
            <textarea
              spellCheck="false"
              readOnly
              value={output}
              placeholder="Formatted output will appear here..."
            />
            <div className="button-row small">
              <button onClick={copyOutput}>Copy Output</button>
              <button onClick={clearOutput}>Clear</button>
            </div>
          </article>
        </section>

        <section className="panel status-panel">
          <div className="section-heading">
            <h2>Status</h2>
            <p>Parser feedback and quick guidance.</p>
          </div>
          <div className={`status ${status.tone}`}>{status.message}</div>
        </section>
      </main>
    </div>
  );
}
