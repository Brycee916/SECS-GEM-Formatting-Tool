import { formatBatch, parseBatchInput } from "./formatterCore.js";

function splitLines(text) {
  return text === "" ? [] : text.split("\n");
}

export function normalizeForDiff(input, options) {
  if (!input.trim()) {
    return "";
  }

  const batch = parseBatchInput(input);
  return formatBatch(batch.messages, options);
}

export function createLineDiff(leftText, rightText) {
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      if (left[leftIndex] === right[rightIndex]) {
        table[leftIndex][rightIndex] = table[leftIndex + 1][rightIndex + 1] + 1;
      } else {
        table[leftIndex][rightIndex] = Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
      }
    }
  }

  const rows = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      rows.push({
        type: "same",
        left: left[leftIndex],
        right: right[rightIndex]
      });
      leftIndex += 1;
      rightIndex += 1;
    } else if (table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1]) {
      rows.push({
        type: "remove",
        left: left[leftIndex],
        right: ""
      });
      leftIndex += 1;
    } else {
      rows.push({
        type: "add",
        left: "",
        right: right[rightIndex]
      });
      rightIndex += 1;
    }
  }

  while (leftIndex < left.length) {
    rows.push({
      type: "remove",
      left: left[leftIndex],
      right: ""
    });
    leftIndex += 1;
  }

  while (rightIndex < right.length) {
    rows.push({
      type: "add",
      left: "",
      right: right[rightIndex]
    });
    rightIndex += 1;
  }

  const summary = rows.reduce(
    (result, row) => {
      result[row.type] += 1;
      return result;
    },
    { same: 0, add: 0, remove: 0 }
  );

  return {
    rows,
    summary
  };
}
