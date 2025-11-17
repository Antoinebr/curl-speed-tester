/**
 * Parses a single line of curl's verbose output to find our headers.
 * Case-insensitive check.
 * @param {string} line - A single line from the curl output.
 * @returns {object | null} - An object {key, value} or null.
 */
export function parseHeader(line) {
  
  const lowerLine = line.toLowerCase().replace('< ', '');
  
  if (lowerLine.startsWith('x-served-by:')) {
    return { key: 'xServedBy', value: line.substring(15).trim() };
  }
  if (lowerLine.startsWith('x-cache:')) {

    return { key: 'xCache', value: line.substring(10).trim() };
  }
  if (lowerLine.startsWith('date:')) {
    return { key: 'date', value: line.substring(7).trim() };
  }
  return null;
}



/**
 * Creates a file-friendly name from a URL and a timestamp.
 * e.g., 'https://.../file.140gb?bs=10' -> 'file.140gb_2025-11-13T15-00-00.log'
 */
export function createLogFileName(urlStr) {
  const url = new URL(urlStr);
  // Get pathname and remove leading slash
  const pathPart = url.pathname.substring(1); 
  
  // Basic sanitization
  const friendlyName = pathPart.replace(/[^a-z0-9._-]/gi, '_') || 'download';
  
  // Create a clean timestamp (ISO string, replacing colons)
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-') // Replace colons to be file-name safe
    .substring(0, 19);  // Truncate milliseconds (e.g., ...T15-00-00)

  return `${friendlyName}_${timestamp}.log`;
}
