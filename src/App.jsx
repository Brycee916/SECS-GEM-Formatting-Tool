import { useEffect, useState } from "react";
import { createLineDiff, normalizeForDiff } from "./diff.js";
import {
  convertJsonToSecs,
  countItems,
  countItemsWithExplicitCounts,
  formatBatch,
  formatParsed,
  parseBatchInput,
  serializeMessages
} from "./formatterCore.js";
import { messageTemplates } from "./templates.js";
import { collectValidationIssues, summarizeIssues } from "./validation.js";
import {
  asciiToHexBytes,
  bytesToAscii,
  decimalListToHex,
  hexListToDecimal
} from "./utils/converters.js";

const defaultStatus = {
  tone: "ok",
  message: "Ready. Paste a SECS/GEM message and format it."
};

const defaultUtilityStatus = {
  tone: "ok",
  message: "Conversion helpers are ready."
};

const emptyAnalysis = {
  formatted: "",
  json: "",
  messages: [],
  ignoredSegments: [],
  issues: [],
  issueSummary: { error: 0, warning: 0, info: 0 },
  summary: null,
  fatalError: null
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

function buildAnalysis(input, formatOptions) {
  try {
    const batch = parseBatchInput(input);
    const messages = batch.messages.map((message) => ({
      ...message,
      formatted: formatParsed(message.items, formatOptions),
      itemCount: message.items.reduce((total, item) => total + countItems([item]), 0),
      explicitCountItems: message.items.reduce((total, item) => total + countItemsWithExplicitCounts([item]), 0)
    }));
    const issues = collectValidationIssues(messages, batch.ignoredSegments);
    const issueSummary = summarizeIssues(issues);
    const totalItems = messages.reduce((total, message) => total + message.itemCount, 0);
    const explicitCountItems = messages.reduce((total, message) => total + message.explicitCountItems, 0);

    return {
      formatted: formatBatch(messages, formatOptions),
      json: JSON.stringify({ messages: serializeMessages(messages) }, null, 2),
      messages,
      ignoredSegments: batch.ignoredSegments,
      issues,
      issueSummary,
      summary: {
        totalMessages: messages.length,
        totalItems,
        explicitCountItems,
        ignoredSegmentCount: batch.ignoredSegments.filter((segment) => segment.text.trim()).length
      },
      fatalError: null
    };
  } catch (error) {
    return {
      ...emptyAnalysis,
      issues: [
        {
          id: "fatal-parse-error",
          severity: "error",
          message: error.message,
          context: "Parser"
        }
      ],
      issueSummary: { error: 1, warning: 0, info: 0 },
      fatalError: error.message
    };
  }
}

function statusFromAnalysis(analysis, outputMode) {
  if (analysis.fatalError) {
    return {
      tone: "error",
      message: analysis.fatalError
    };
  }

  if (!analysis.summary) {
    return defaultStatus;
  }

  const modeLabel =
    outputMode === "with-counts"
      ? "count markers added"
      : outputMode === "without-counts"
        ? "count markers removed"
        : "input count style preserved";

  if (analysis.issueSummary.error > 0 || analysis.issueSummary.warning > 0) {
    return {
      tone: "warn",
      message: `Formatted ${analysis.summary.totalMessages} message(s) with ${analysis.issueSummary.error} error(s), ${analysis.issueSummary.warning} warning(s), and ${analysis.issueSummary.info} info note(s); output was rendered with ${modeLabel}.`
    };
  }

  return {
    tone: "ok",
    message: `Formatted ${analysis.summary.totalMessages} message(s) and ${analysis.summary.totalItems} item(s); ${analysis.summary.explicitCountItems} item(s) used explicit count markers, and the output was rendered with ${modeLabel}.`
  };
}

function templateById(templateId) {
  return messageTemplates.find((template) => template.id === templateId) || messageTemplates[0];
}

export default function App() {
  const [input, setInput] = useState("");
  const [outputMode, setOutputMode] = useState("preserve");
  const [indentMode, setIndentMode] = useState("tabs");
  const [compactScalars, setCompactScalars] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState("formatted");
  const [analysis, setAnalysis] = useState(emptyAnalysis);
  const [status, setStatus] = useState(defaultStatus);
  const [selectedTemplateId, setSelectedTemplateId] = useState(messageTemplates[0].id);
  const [jsonDraft, setJsonDraft] = useState("");
  const [diffLeft, setDiffLeft] = useState("");
  const [diffRight, setDiffRight] = useState("");
  const [diffMode, setDiffMode] = useState("without-counts");
  const [diffAnalysis, setDiffAnalysis] = useState({
    rows: [],
    summary: { same: 0, add: 0, remove: 0 },
    error: ""
  });
  const [decimalInput, setDecimalInput] = useState("");
  const [hexInput, setHexInput] = useState("");
  const [asciiInput, setAsciiInput] = useState("");
  const [byteInput, setByteInput] = useState("");
  const [utilityStatus, setUtilityStatus] = useState(defaultUtilityStatus);

  useEffect(() => {
    if (!input.trim()) {
      setAnalysis(emptyAnalysis);
      setStatus(defaultStatus);
      return;
    }

    const formatOptions = {
      mode: outputMode,
      indentUnit: getIndentUnit(indentMode),
      compactScalars
    };
    const nextAnalysis = buildAnalysis(input, formatOptions);
    setAnalysis(nextAnalysis);
    setStatus(statusFromAnalysis(nextAnalysis, outputMode));
  }, [input, outputMode, indentMode, compactScalars]);

  useEffect(() => {
    if (!diffLeft.trim() && !diffRight.trim()) {
      setDiffAnalysis({
        rows: [],
        summary: { same: 0, add: 0, remove: 0 },
        error: ""
      });
      return;
    }

    try {
      const options = {
        mode: diffMode,
        indentUnit: getIndentUnit(indentMode),
        compactScalars
      };
      const normalizedLeft = diffLeft.trim() ? normalizeForDiff(diffLeft, options) : "";
      const normalizedRight = diffRight.trim() ? normalizeForDiff(diffRight, options) : "";
      setDiffAnalysis({
        ...createLineDiff(normalizedLeft, normalizedRight),
        error: ""
      });
    } catch (error) {
      setDiffAnalysis({
        rows: [],
        summary: { same: 0, add: 0, remove: 0 },
        error: error.message
      });
    }
  }, [diffLeft, diffRight, diffMode, indentMode, compactScalars]);

  async function copyText(text, successMessage) {
    if (!text.trim()) {
      setStatus({
        tone: "error",
        message: "There is no text available to copy."
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus({
        tone: "ok",
        message: successMessage
      });
    } catch {
      setStatus({
        tone: "error",
        message: "Clipboard access failed. You can still select and copy the text manually."
      });
    }
  }

  function loadTemplate(replace = true) {
    const template = templateById(selectedTemplateId);
    setInput((current) => (replace || !current.trim() ? template.message : `${current}\n\n${template.message}`));
    setStatus({
      tone: "ok",
      message: `${template.name} loaded into the formatter.`
    });
  }

  function clearInput() {
    setInput("");
    setStatus({
      tone: "ok",
      message: "Input cleared."
    });
  }

  function clearOutputViews() {
    setJsonDraft("");
    setStatus({
      tone: "ok",
      message: "JSON draft cleared. Formatted output stays tied to the current input."
    });
  }

  function useOutputAsInput() {
    if (!analysis.formatted.trim()) {
      setStatus({
        tone: "error",
        message: "There is no formatted output to move back into the input."
      });
      return;
    }

    setInput(analysis.formatted);
    setActiveOutputTab("formatted");
    setStatus({
      tone: "ok",
      message: "Formatted output moved back into the input editor."
    });
  }

  function loadCurrentJson() {
    setJsonDraft(analysis.json);
    setStatus({
      tone: "ok",
      message: "Current parsed JSON was loaded into the JSON round-trip editor."
    });
  }

  function importJsonToInput() {
    if (!jsonDraft.trim()) {
      setStatus({
        tone: "error",
        message: "Paste JSON into the round-trip editor first."
      });
      return;
    }

    try {
      const secsText = convertJsonToSecs(jsonDraft, {
        mode: outputMode,
        indentUnit: getIndentUnit(indentMode),
        compactScalars
      });
      setInput(secsText);
      setActiveOutputTab("formatted");
      setStatus({
        tone: "ok",
        message: "JSON was converted back into SECS/GEM text and loaded into the input."
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error.message
      });
    }
  }

  function useBatchMessage(messageText) {
    setInput(messageText);
    setActiveOutputTab("formatted");
    setStatus({
      tone: "ok",
      message: "The selected batch message was moved into the main input."
    });
  }

  function convertDecimals() {
    try {
      const nextHex = decimalListToHex(decimalInput);
      setHexInput(nextHex);
      setUtilityStatus({
        tone: "ok",
        message: "Decimal values converted to hex bytes."
      });
    } catch (error) {
      setUtilityStatus({
        tone: "error",
        message: error.message
      });
    }
  }

  function convertHex() {
    try {
      const nextDecimal = hexListToDecimal(hexInput);
      setDecimalInput(nextDecimal);
      setUtilityStatus({
        tone: "ok",
        message: "Hex bytes converted to decimal values."
      });
    } catch (error) {
      setUtilityStatus({
        tone: "error",
        message: error.message
      });
    }
  }

  function convertAscii() {
    try {
      const nextBytes = asciiToHexBytes(asciiInput);
      setByteInput(nextBytes);
      setUtilityStatus({
        tone: "ok",
        message: "ASCII text converted to byte values."
      });
    } catch (error) {
      setUtilityStatus({
        tone: "error",
        message: error.message
      });
    }
  }

  function convertBytes() {
    try {
      const nextAscii = bytesToAscii(byteInput);
      setAsciiInput(nextAscii);
      setUtilityStatus({
        tone: "ok",
        message: "Byte values converted to ASCII text."
      });
    } catch (error) {
      setUtilityStatus({
        tone: "error",
        message: error.message
      });
    }
  }

  const selectedTemplate = templateById(selectedTemplateId);

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">SECS/GEM Utility</p>
          <h1>Format, validate, diff, and round-trip SECS/GEM messages.</h1>
          <p className="hero-text">
            This React workbench now supports clean formatting, datatype count conversions, batch
            log extraction, validation checks, JSON round-tripping, diffing, engineer utilities,
            and quick templates for common equipment integration flows.
          </p>
        </div>

        <div className="hero-card">
          <div className="stat">
            <span className="stat-label">Batch Extraction</span>
            <strong>Logs to Messages</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Validation</span>
            <strong>Counts + Structure</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Toolkit</span>
            <strong>JSON, Diff, Converters</strong>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="panel controls-panel">
          <div className="section-heading">
            <h2>Formatter Controls</h2>
            <p>Choose how the output should be rendered and how message templates should load.</p>
          </div>

          <div className="controls-grid controls-grid-wide">
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

            <label className="control">
              <span>Template Library</span>
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                {messageTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
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
            <button className="primary" onClick={() => setOutputMode("preserve")}>
              Preserve Count Style
            </button>
            <button onClick={() => setOutputMode("with-counts")}>Convert to Counted</button>
            <button onClick={() => setOutputMode("without-counts")}>Convert to Uncounted</button>
            <button onClick={useOutputAsInput}>Use Output as Input</button>
            <button onClick={() => loadTemplate(true)}>Load Template</button>
            <button onClick={() => loadTemplate(false)}>Append Template</button>
          </div>
        </section>

        <section className="editor-grid">
          <article className="panel">
            <div className="section-heading">
              <h2>Input</h2>
              <p>Paste a single message or a full log; the batch parser will extract each SECS/GEM block.</p>
            </div>
            <textarea
              spellCheck="false"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={'LOG ... <L [2] <A [5] "START" > <U4 [3] 100 200 300 > > ... LOG'}
            />
            <div className="button-row small">
              <button onClick={() => loadTemplate(true)}>Load Selected Template</button>
              <button onClick={clearInput}>Clear</button>
            </div>
          </article>

          <article className="panel">
            <div className="section-heading section-heading-inline">
              <div>
                <h2>Output</h2>
                <p>Switch between formatted text, JSON, and validation findings.</p>
              </div>
              <div className="tab-row">
                <button
                  className={activeOutputTab === "formatted" ? "tab active" : "tab"}
                  onClick={() => setActiveOutputTab("formatted")}
                >
                  Formatted
                </button>
                <button
                  className={activeOutputTab === "json" ? "tab active" : "tab"}
                  onClick={() => setActiveOutputTab("json")}
                >
                  JSON
                </button>
                <button
                  className={activeOutputTab === "validation" ? "tab active" : "tab"}
                  onClick={() => setActiveOutputTab("validation")}
                >
                  Validation
                </button>
              </div>
            </div>

            {activeOutputTab === "formatted" && (
              <>
                <textarea
                  spellCheck="false"
                  readOnly
                  value={analysis.formatted}
                  placeholder="Formatted output will appear here..."
                />
                <div className="button-row small">
                  <button onClick={() => copyText(analysis.formatted, "Formatted output copied to the clipboard.")}>
                    Copy Output
                  </button>
                  <button onClick={clearOutputViews}>Clear JSON Draft</button>
                </div>
              </>
            )}

            {activeOutputTab === "json" && (
              <>
                <textarea
                  spellCheck="false"
                  readOnly
                  value={analysis.json}
                  placeholder="Parsed JSON output will appear here..."
                />
                <div className="button-row small">
                  <button onClick={() => copyText(analysis.json, "JSON output copied to the clipboard.")}>
                    Copy JSON
                  </button>
                  <button onClick={loadCurrentJson}>Load Into JSON Editor</button>
                </div>
              </>
            )}

            {activeOutputTab === "validation" && (
              <div className="validation-surface">
                <div className="issue-summary">
                  <span className="pill pill-error">Errors {analysis.issueSummary.error}</span>
                  <span className="pill pill-warning">Warnings {analysis.issueSummary.warning}</span>
                  <span className="pill pill-info">Info {analysis.issueSummary.info}</span>
                </div>
                {analysis.issues.length === 0 ? (
                  <div className="empty-state">No validation issues detected for the current input.</div>
                ) : (
                  <div className="issue-list">
                    {analysis.issues.map((issue) => (
                      <article key={issue.id} className={`issue-card ${issue.severity}`}>
                        <div className="issue-meta">
                          <span className={`pill pill-${issue.severity}`}>{issue.severity}</span>
                          <span>{issue.context}</span>
                        </div>
                        <p>{issue.message}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Template Preview</h2>
            <p>
              {selectedTemplate.category} template for engineers: {selectedTemplate.description}
            </p>
          </div>
          <div className="template-preview">
            <pre>{selectedTemplate.message}</pre>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Batch Extraction</h2>
            <p>
              {analysis.summary
                ? `Extracted ${analysis.summary.totalMessages} message(s) from the current input.`
                : "Paste a batch log to split it into individual messages."}
            </p>
          </div>

          {analysis.summary && (
            <div className="batch-summary-grid">
              <div className="mini-stat">
                <span>Messages</span>
                <strong>{analysis.summary.totalMessages}</strong>
              </div>
              <div className="mini-stat">
                <span>Items</span>
                <strong>{analysis.summary.totalItems}</strong>
              </div>
              <div className="mini-stat">
                <span>Explicit Counts</span>
                <strong>{analysis.summary.explicitCountItems}</strong>
              </div>
              <div className="mini-stat">
                <span>Ignored Segments</span>
                <strong>{analysis.summary.ignoredSegmentCount}</strong>
              </div>
            </div>
          )}

          {analysis.ignoredSegments.some((segment) => segment.text.trim()) && (
            <div className="ignored-blocks">
              {analysis.ignoredSegments
                .filter((segment) => segment.text.trim())
                .map((segment) => (
                  <article key={`${segment.start}-${segment.end}`} className="ignored-card">
                    <strong>Ignored log text</strong>
                    <p>{segment.text.trim()}</p>
                  </article>
                ))}
            </div>
          )}

          <div className="batch-grid">
            {analysis.messages.map((message, index) => (
              <article key={message.id} className="batch-card">
                <div className="batch-card-header">
                  <div>
                    <h3>Message {index + 1}</h3>
                    <p>
                      {message.itemCount} item(s), {message.explicitCountItems} explicit count marker item(s)
                    </p>
                  </div>
                  <div className="button-row compact">
                    <button onClick={() => copyText(message.formatted, `Message ${index + 1} copied to the clipboard.`)}>
                      Copy
                    </button>
                    <button onClick={() => useBatchMessage(message.formatted)}>Use as Input</button>
                  </div>
                </div>
                <textarea readOnly value={message.formatted} spellCheck="false" className="batch-textarea" />
              </article>
            ))}
            {!analysis.messages.length && <div className="empty-state">No extracted messages yet.</div>}
          </div>
        </section>

        <section className="tool-grid">
          <article className="panel">
            <div className="section-heading">
              <h2>JSON Round-Trip</h2>
              <p>Load the current parse tree, edit JSON, and convert it back into SECS/GEM text.</p>
            </div>
            <textarea
              spellCheck="false"
              value={jsonDraft}
              onChange={(event) => setJsonDraft(event.target.value)}
              placeholder='{"messages":[{"items":[{"type":"L","children":[],"values":[]}]}]}'
              className="short-textarea"
            />
            <div className="button-row small">
              <button onClick={loadCurrentJson}>Load Current JSON</button>
              <button onClick={importJsonToInput}>JSON to Input</button>
              <button onClick={() => copyText(jsonDraft, "JSON draft copied to the clipboard.")}>Copy Draft</button>
            </div>
          </article>

          <article className="panel">
            <div className="section-heading">
              <h2>Validation Summary</h2>
              <p>Quick health snapshot for datatype counts and message structure.</p>
            </div>
            <div className="issue-summary">
              <span className="pill pill-error">Errors {analysis.issueSummary.error}</span>
              <span className="pill pill-warning">Warnings {analysis.issueSummary.warning}</span>
              <span className="pill pill-info">Info {analysis.issueSummary.info}</span>
            </div>
            {analysis.issues.slice(0, 4).map((issue) => (
              <article key={issue.id} className={`issue-card compact-issue ${issue.severity}`}>
                <div className="issue-meta">
                  <span className={`pill pill-${issue.severity}`}>{issue.severity}</span>
                  <span>{issue.context}</span>
                </div>
                <p>{issue.message}</p>
              </article>
            ))}
            {analysis.issues.length === 0 && <div className="empty-state">No current validation findings.</div>}
          </article>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Diff Workbench</h2>
            <p>Normalize two messages or logs and inspect line-level differences side by side.</p>
          </div>

          <div className="controls-grid diff-controls">
            <label className="control">
              <span>Diff normalization</span>
              <select value={diffMode} onChange={(event) => setDiffMode(event.target.value)}>
                <option value="preserve">Preserve source count style</option>
                <option value="with-counts">Normalize with count markers</option>
                <option value="without-counts">Normalize without count markers</option>
              </select>
            </label>
            <div className="button-row compact">
              <button onClick={() => setDiffLeft(input)}>Use Main Input on Left</button>
              <button onClick={() => setDiffRight(input)}>Use Main Input on Right</button>
            </div>
          </div>

          <div className="editor-grid diff-inputs">
            <textarea
              spellCheck="false"
              value={diffLeft}
              onChange={(event) => setDiffLeft(event.target.value)}
              placeholder="Left message or log"
              className="short-textarea"
            />
            <textarea
              spellCheck="false"
              value={diffRight}
              onChange={(event) => setDiffRight(event.target.value)}
              placeholder="Right message or log"
              className="short-textarea"
            />
          </div>

          {diffAnalysis.error ? (
            <div className="status error">{diffAnalysis.error}</div>
          ) : (
            <>
              <div className="issue-summary">
                <span className="pill pill-info">Same {diffAnalysis.summary.same}</span>
                <span className="pill pill-warning">Added {diffAnalysis.summary.add}</span>
                <span className="pill pill-error">Removed {diffAnalysis.summary.remove}</span>
              </div>
              <div className="diff-viewer">
                <div className="diff-header">
                  <span>Left</span>
                  <span>Right</span>
                </div>
                {diffAnalysis.rows.length === 0 ? (
                  <div className="empty-state">Paste two messages to start comparing.</div>
                ) : (
                  diffAnalysis.rows.map((row, index) => (
                    <div key={`${row.type}-${index}`} className={`diff-row ${row.type}`}>
                      <pre>{row.left || " "}</pre>
                      <pre>{row.right || " "}</pre>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Engineer Utilities</h2>
            <p>Quick helpers for binary payloads, byte values, and readable text.</p>
          </div>
          <div className="utility-grid">
            <div className="utility-card">
              <h3>Decimal and Hex</h3>
              <label className="control">
                <span>Decimal values</span>
                <textarea
                  spellCheck="false"
                  value={decimalInput}
                  onChange={(event) => setDecimalInput(event.target.value)}
                  placeholder="1 10 255"
                  className="short-textarea"
                />
              </label>
              <label className="control">
                <span>Hex values</span>
                <textarea
                  spellCheck="false"
                  value={hexInput}
                  onChange={(event) => setHexInput(event.target.value)}
                  placeholder="0x01 0x0A 0xFF"
                  className="short-textarea"
                />
              </label>
              <div className="button-row small">
                <button onClick={convertDecimals}>Decimal to Hex</button>
                <button onClick={convertHex}>Hex to Decimal</button>
              </div>
            </div>

            <div className="utility-card">
              <h3>ASCII and Bytes</h3>
              <label className="control">
                <span>ASCII text</span>
                <textarea
                  spellCheck="false"
                  value={asciiInput}
                  onChange={(event) => setAsciiInput(event.target.value)}
                  placeholder="START"
                  className="short-textarea"
                />
              </label>
              <label className="control">
                <span>Byte values</span>
                <textarea
                  spellCheck="false"
                  value={byteInput}
                  onChange={(event) => setByteInput(event.target.value)}
                  placeholder="0x53 0x54 0x41 0x52 0x54"
                  className="short-textarea"
                />
              </label>
              <div className="button-row small">
                <button onClick={convertAscii}>ASCII to Bytes</button>
                <button onClick={convertBytes}>Bytes to ASCII</button>
              </div>
            </div>
          </div>
          <div className={`status ${utilityStatus.tone}`}>{utilityStatus.message}</div>
        </section>

        <section className="panel status-panel">
          <div className="section-heading">
            <h2>Status</h2>
            <p>Overall parser feedback and workflow guidance.</p>
          </div>
          <div className={`status ${status.tone}`}>{status.message}</div>
        </section>
      </main>
    </div>
  );
}
