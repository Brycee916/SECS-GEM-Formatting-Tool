function splitTokens(input) {
  return input
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseHexToken(token) {
  const normalized = token.startsWith("0x") || token.startsWith("0X") ? token.slice(2) : token;
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid hex token: ${token}`);
  }
  return Number.parseInt(normalized, 16);
}

function parseDecimalToken(token) {
  if (!/^-?\d+$/.test(token)) {
    throw new Error(`Invalid decimal token: ${token}`);
  }
  return Number.parseInt(token, 10);
}

export function decimalListToHex(input) {
  return splitTokens(input)
    .map(parseDecimalToken)
    .map((value) => `0x${value.toString(16).toUpperCase().padStart(2, "0")}`)
    .join(" ");
}

export function hexListToDecimal(input) {
  return splitTokens(input)
    .map(parseHexToken)
    .join(" ");
}

export function asciiToHexBytes(input) {
  return Array.from(input)
    .map((char) => `0x${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
    .join(" ");
}

export function bytesToAscii(input) {
  return splitTokens(input)
    .map(parseHexToken)
    .map((value) => {
      if (value < 0 || value > 255) {
        throw new Error(`Byte out of range: ${value}`);
      }

      if (value < 32 || value > 126) {
        return ".";
      }

      return String.fromCharCode(value);
    })
    .join("");
}
