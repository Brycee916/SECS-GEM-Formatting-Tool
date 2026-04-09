export function tokenize(input) {
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "<" || char === ">") {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (char === "[") {
      let end = index + 1;
      while (end < input.length && input[end] !== "]") {
        end += 1;
      }

      if (end >= input.length) {
        throw new Error("Unclosed count marker.");
      }

      const raw = input.slice(index + 1, end).trim();
      if (!/^\d+$/.test(raw)) {
        throw new Error(`Invalid count marker: [${raw}]`);
      }

      tokens.push({ type: "count", value: Number(raw) });
      index = end + 1;
      continue;
    }

    if (char === '"') {
      let end = index + 1;
      let escaped = false;
      let value = "";

      while (end < input.length) {
        const current = input[end];

        if (escaped) {
          value += current;
          escaped = false;
        } else if (current === "\\") {
          value += current;
          escaped = true;
        } else if (current === '"') {
          break;
        } else {
          value += current;
        }

        end += 1;
      }

      if (end >= input.length || input[end] !== '"') {
        throw new Error("Unclosed quoted string.");
      }

      tokens.push({ type: "string", value });
      index = end + 1;
      continue;
    }

    let end = index;
    while (
      end < input.length &&
      !/\s/.test(input[end]) &&
      !["<", ">", "[", "]", '"'].includes(input[end])
    ) {
      end += 1;
    }

    tokens.push({ type: "word", value: input.slice(index, end) });
    index = end;
  }

  return tokens;
}

export function parseMessage(input) {
  const tokens = tokenize(input);
  let position = 0;

  function current() {
    return tokens[position];
  }

  function consume(expectedType) {
    const token = current();
    if (!token || token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but found ${token ? token.type : "end of input"}.`);
    }
    position += 1;
    return token;
  }

  function parseItem() {
    consume("<");

    const typeToken = consume("word");
    const item = {
      type: typeToken.value,
      explicitCount: null,
      children: [],
      values: []
    };

    if (current()?.type === "count") {
      item.explicitCount = consume("count").value;
    }

    while (current() && current().type !== ">") {
      if (current().type === "<") {
        item.children.push(parseItem());
        continue;
      }

      if (current().type === "count") {
        throw new Error(`Unexpected count marker inside ${item.type}.`);
      }

      item.values.push(tokens[position]);
      position += 1;
    }

    consume(">");
    return item;
  }

  const items = [];
  while (position < tokens.length) {
    if (current().type !== "<") {
      throw new Error(`Unexpected token "${current().value}".`);
    }
    items.push(parseItem());
  }

  return items;
}

export function extractMessageBlocks(input) {
  const blocks = [];
  const ignoredSegments = [];
  let blockStart = null;
  let depth = 0;
  let lastConsumed = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (depth > 0 && inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (depth > 0 && char === '"') {
      inString = true;
      continue;
    }

    if (char === "<") {
      if (depth === 0) {
        if (index > lastConsumed) {
          ignoredSegments.push({
            text: input.slice(lastConsumed, index),
            start: lastConsumed,
            end: index
          });
        }
        blockStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === ">") {
      if (depth === 0) {
        continue;
      }

      depth -= 1;
      if (depth === 0 && blockStart !== null) {
        blocks.push({
          raw: input.slice(blockStart, index + 1),
          start: blockStart,
          end: index + 1
        });
        lastConsumed = index + 1;
        blockStart = null;
      }
    }
  }

  if (depth !== 0) {
    throw new Error("Unbalanced angle brackets in input. At least one message block is incomplete.");
  }

  if (lastConsumed < input.length) {
    ignoredSegments.push({
      text: input.slice(lastConsumed),
      start: lastConsumed,
      end: input.length
    });
  }

  return {
    blocks,
    ignoredSegments
  };
}

export function parseBatchInput(input) {
  const extraction = extractMessageBlocks(input);

  if (extraction.blocks.length === 0) {
    throw new Error("No SECS/GEM message blocks were found in the input.");
  }

  return {
    ignoredSegments: extraction.ignoredSegments,
    messages: extraction.blocks.map((block, index) => ({
      id: `message-${index + 1}`,
      raw: block.raw,
      start: block.start,
      end: block.end,
      items: parseMessage(block.raw)
    }))
  };
}

export function inferCount(item) {
  const upperType = item.type.toUpperCase();

  if (upperType === "L") {
    return item.children.length;
  }

  if (item.values.length === 0) {
    return 0;
  }

  if (upperType === "A") {
    return item.values.reduce((total, token) => total + token.value.length, 0);
  }

  return item.values.length;
}

function tokenToText(token) {
  if (token.type === "string") {
    return `"${token.value}"`;
  }

  return token.value;
}

function shouldShowCount(item, mode) {
  if (mode === "with-counts") {
    return true;
  }

  if (mode === "without-counts") {
    return false;
  }

  return item.explicitCount !== null;
}

function renderItem(item, depth, options) {
  const indent = options.indentUnit.repeat(depth);
  const parts = [`${indent}<${item.type}`];

  if (shouldShowCount(item, options.mode)) {
    parts.push(` [${item.explicitCount ?? inferCount(item)}]`);
  }

  if (item.children.length === 0 && item.values.length === 0) {
    parts.push(">");
    return parts.join("");
  }

  if (item.children.length === 0) {
    const payload = item.values.map(tokenToText).join(" ");
    parts.push(payload ? ` ${payload} >` : " >");
    return parts.join("");
  }

  if (options.compactScalars && item.children.every((child) => child.children.length === 0)) {
    const inlineChildren = item.children
      .map((child) => renderItem(child, 0, options).trim())
      .join(" ");
    parts.push(` ${inlineChildren} >`);
    return parts.join("");
  }

  const childLines = item.children.map((child) => renderItem(child, depth + 1, options)).join("\n");
  parts.push("\n");
  parts.push(childLines);
  parts.push(`\n${indent}>`);
  return parts.join("");
}

export function formatParsed(items, options) {
  const normalizedOptions = {
    mode: options.mode || "preserve",
    indentUnit: options.indentUnit || "\t",
    compactScalars: Boolean(options.compactScalars)
  };

  return items.map((item) => renderItem(item, 0, normalizedOptions)).join("\n");
}

export function formatBatch(messages, options) {
  return messages.map((message) => formatParsed(message.items, options)).join("\n\n");
}

function serializeToken(token) {
  return {
    type: token.type,
    value: token.value
  };
}

function serializeItem(item) {
  return {
    type: item.type,
    explicitCount: item.explicitCount,
    inferredCount: inferCount(item),
    values: item.values.map(serializeToken),
    children: item.children.map(serializeItem)
  };
}

export function serializeMessages(messages) {
  return messages.map((message, index) => ({
    id: message.id || `message-${index + 1}`,
    raw: message.raw,
    items: message.items.map(serializeItem)
  }));
}

function normalizeToken(entry, itemType) {
  if (entry && typeof entry === "object" && "value" in entry) {
    return {
      type: entry.type === "string" ? "string" : "word",
      value: String(entry.value)
    };
  }

  if (typeof entry === "number") {
    return {
      type: "word",
      value: String(entry)
    };
  }

  if (typeof entry === "boolean") {
    return {
      type: "word",
      value: entry ? "TRUE" : "FALSE"
    };
  }

  if (typeof entry === "string") {
    return {
      type: itemType.toUpperCase() === "A" ? "string" : "word",
      value: entry
    };
  }

  throw new Error("Unsupported JSON token value.");
}

function deserializeItem(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Each JSON item must be an object.");
  }

  if (!source.type || typeof source.type !== "string") {
    throw new Error("Each JSON item must include a string type.");
  }

  const values = Array.isArray(source.values) ? source.values.map((entry) => normalizeToken(entry, source.type)) : [];
  const children = Array.isArray(source.children) ? source.children.map(deserializeItem) : [];

  return {
    type: source.type,
    explicitCount: Number.isInteger(source.explicitCount) ? source.explicitCount : null,
    values,
    children
  };
}

export function parseJsonMessages(jsonText) {
  const parsed = JSON.parse(jsonText);
  let messageEntries;

  if (Array.isArray(parsed)) {
    if (parsed.every((entry) => entry && typeof entry === "object" && Array.isArray(entry.items))) {
      messageEntries = parsed;
    } else {
      messageEntries = [{ id: "message-1", items: parsed }];
    }
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.messages)) {
    messageEntries = parsed.messages;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
    messageEntries = [parsed];
  } else {
    messageEntries = [{ id: "message-1", items: [parsed] }];
  }

  return messageEntries.map((entry, index) => ({
    id: entry.id || `json-message-${index + 1}`,
    raw: "",
    items: Array.isArray(entry.items) ? entry.items.map(deserializeItem) : [deserializeItem(entry)]
  }));
}

export function convertJsonToSecs(jsonText, options) {
  const messages = parseJsonMessages(jsonText);
  return formatBatch(messages, options);
}

export function countItems(items) {
  return items.reduce((total, item) => total + 1 + countItems(item.children), 0);
}

export function countItemsWithExplicitCounts(items) {
  return items.reduce(
    (total, item) => total + (item.explicitCount !== null ? 1 : 0) + countItemsWithExplicitCounts(item.children),
    0
  );
}
