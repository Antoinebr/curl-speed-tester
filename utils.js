/**
 * Parses a single line of curl's verbose output to find our headers.
 * Case-insensitive check.
 * @param {string} line - A single line from the curl output.
 * @returns {object | null} - An object {key, value} or null.
 */
export function parseHeader(line) {
  
  const lowerLine = line.toLowerCase().replace('< ', '');
  
  if (lowerLine.startsWith('x-served-by:')) {
    return { key: 'xServedBy', value: line.substring(13).trim() };
  }
  if (lowerLine.startsWith('x-cache:')) {

    return { key: 'xCache', value: line.substring(10).trim() };
  }
  if (lowerLine.startsWith('date:')) {
    return { key: 'date', value: line.substring(5).trim() };
  }
  return null;
}
