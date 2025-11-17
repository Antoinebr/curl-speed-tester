import { spawn } from 'child_process';
import {parseHeader} from "./utils.js";

/**
 * Executes the curl command for a single URL.
 * @param {string} url - The URL to test.
 * @returns {Promise<object>} - A promise that resolves with the test results.
 */
export function executeCurl(url) {
  return new Promise((resolve, reject) => {
    
    // Arguments for curl
    const curlArgs = [
      '-w', '%{speed_download}\n', // Write speed to stdout
      '-o', '/dev/null',           // Send file download to null
      url.url, 
      // '--connect-to', url.ipToConnect,    
      '-v'                         // Verbose output to stderr
    ];

    let speed = '';
    let fullLog = ''; // We will capture *all* output here
    
    // Spawn the curl process
    const curl = spawn('curl', curlArgs);

    // curl's -w output (speed) goes to stdout
    curl.stdout.on('data', (data) => {
      const dataStr = data.toString();
      speed += dataStr; // Capture speed
      fullLog += dataStr; // Add to full log
    });

    // curl's -v output (verbose) goes to stderr
    curl.stderr.on('data', (data) => {
      const dataStr = data.toString();
      fullLog += dataStr; // Add to full log
    });

    // Handle process error (e.g., command not found)
    curl.on('error', (err) => {
      reject(err);
    });

    // When the process finishes
    curl.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`curl process exited with code ${code}.\nLog:\n${fullLog}`));
        return;
      }
      
      // Now that we have the full log, parse it
      const results = {
        speed: speed.trim(), // The speed from stdout
        xServedBy: '',
        xCache: '',
        date: '',
        fullLog: fullLog
      };

      const lines = fullLog.split('\n');
      for (const line of lines) {
        const header = parseHeader(line);
        if (header) {
          results[header.key] = header.value;
        }
      }

      resolve(results);
    });
  });
}