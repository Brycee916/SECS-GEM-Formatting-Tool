import { inferCount } from "./formatterCore.js";

function addIssue(issues, severity, message, context) {
  issues.push({
    id: `${severity}-${issues.length + 1}`,
    severity,
    message,
    context
  });
}

function validateItem(item, issues, messageIndex, path) {
  const itemLabel = `${path} <${item.type}>`;
  const inferredCount = inferCount(item);
  const upperType = item.type.toUpperCase();

  if (item.explicitCount !== null && item.explicitCount !== inferredCount) {
    addIssue(
      issues,
      "error",
      `Explicit count [${item.explicitCount}] does not match actual count [${inferredCount}] for ${itemLabel}.`,
      `Message ${messageIndex + 1}`
    );
  }

  if (item.children.length > 0 && item.values.length > 0) {
    addIssue(
      issues,
      "warning",
      `${itemLabel} mixes list children and scalar values. Many tools expect one structure or the other.`,
      `Message ${messageIndex + 1}`
    );
  }

  if (upperType === "L" && item.values.length > 0) {
    addIssue(
      issues,
      "warning",
      `${itemLabel} is a list item but also contains scalar tokens.`,
      `Message ${messageIndex + 1}`
    );
  }

  if (upperType === "A" && item.values.some((value) => value.type !== "string")) {
    addIssue(
      issues,
      "info",
      `${itemLabel} contains non-quoted ASCII data. That may be intentional, but it is worth double-checking.`,
      `Message ${messageIndex + 1}`
    );
  }

  if (upperType === "BOOLEAN") {
    const invalidBooleans = item.values.filter((value) => !["TRUE", "FALSE", "1", "0"].includes(String(value.value).toUpperCase()));
    if (invalidBooleans.length > 0) {
      addIssue(
        issues,
        "warning",
        `${itemLabel} contains BOOLEAN values outside the common TRUE/FALSE/1/0 set.`,
        `Message ${messageIndex + 1}`
      );
    }
  }

  item.children.forEach((child, index) => {
    validateItem(child, issues, messageIndex, `${path}.${index + 1}`);
  });
}

export function collectValidationIssues(messages, ignoredSegments = []) {
  const issues = [];

  ignoredSegments.forEach((segment) => {
    if (segment.text.trim()) {
      addIssue(
        issues,
        "warning",
        "Non-SECS/GEM text was found between extracted message blocks and ignored by the batch parser.",
        `Chars ${segment.start}-${segment.end}`
      );
    }
  });

  messages.forEach((message, messageIndex) => {
    message.items.forEach((item, index) => {
      validateItem(item, issues, messageIndex, `${messageIndex + 1}.${index + 1}`);
    });
  });

  return issues;
}

export function summarizeIssues(issues) {
  return issues.reduce(
    (summary, issue) => {
      summary[issue.severity] += 1;
      return summary;
    },
    { error: 0, warning: 0, info: 0 }
  );
}
