import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { URL } from 'url';
import path from 'path'; // Using path for cross-platform file saving
import { url } from 'inspector';
import { uploadToS3 } from  './s3_uploader.js';
import { postResultsToLogServer } from './log_server.js';
import {readFileSync} from "fs";

// --- Configuration ---

// Add all the URLs you want to test in this array
// const URLS_TO_TEST = [

//     {
//         url: 'https://speed.fastly.antoinee.xyz/throughput/socket.jpg',//'https://speed.fastly.antoinee.xyz/throughput/OUT-1G-random.bin',
//         //ipToConnect: '151.101.23.52',
//     }

// ];

const URLS_TO_TEST = readFileSync('urlsToTest.txt', 'utf-8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(url => ({ url: url.trim() }));


  

const LOG_DIRECTORY = './curl_logs'; // Directory to store log files

// --- Helper Functions ---

/**
 * Creates a file-friendly name from a URL and a timestamp.
 * e.g., 'https://.../file.140gb?bs=10' -> 'file.140gb_2025-11-13T15-00-00.log'
 */
function createLogFileName(urlStr) {
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

/**
 * Parses a single line of curl's verbose output to find our headers.
 * Case-insensitive check.
 * @param {string} line - A single line from the curl output.
 * @returns {object | null} - An object {key, value} or null.
 */
function parseHeader(line) {
  
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

/**
 * Executes the curl command for a single URL.
 * @param {string} url - The URL to test.
 * @returns {Promise<object>} - A promise that resolves with the test results.
 */
function executeCurl(url) {
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

/**
 * Main function to run all tests.
 */
async function runAllTests() {


  console.log(`Starting curl speed tests for ${URLS_TO_TEST.length} URL(s)...`);
  console.log(`Logs will be saved in: ${LOG_DIRECTORY}\n`);
  
  // Ensure the log directory exists
  try {
    await fs.mkdir(LOG_DIRECTORY, { recursive: true });
  } catch (err) {
    console.error(`Failed to create log directory at ${LOG_DIRECTORY}:`, err);
    return; // Exit if we can't create the log dir
  }

  // Run tests one by one
  for (const url of URLS_TO_TEST) {
    console.log(`--- Testing ${url.url} ---`);
    
    try {
      const results = await executeCurl(url);
      const logFileName = createLogFileName(url.url);
      const logFilePath = path.join(LOG_DIRECTORY, logFileName);

      try {
        console.log(`  Saving full log locally to ${logFilePath}...`);
        // Save the full log file
        await fs.writeFile(logFilePath, results.fullLog);
      } catch (error) {
        console.error(`  Failed to save log file locally: ${error}`);
      }
    
      try {
        console.log(`  Uploading full log to S3 as ${logFileName}...`);
        await uploadToS3(results.fullLog, logFileName);
        console.log(`  Successfully uploaded log to s3://${logFileName}`);
      } catch (error) {
        console.error(`  Failed to upload log to S3: ${error}`);
      }
      
      
      // Print the summary to the console
      
      console.log(`  Date : ${new Date(results.date).toLocaleString()}`);
      console.log(`  Speed: ${results.speed} B/s`);
      console.log(`  x-cache: ${results.xCache || 'N/A'}`);
      console.log(`  x-served-by: ${results.xServedBy || 'N/A'}`);
      console.log(`  date: ${results.date || 'N/A'}`);
      console.log(`  Full log saved to: ${logFilePath}`);
      console.log(`  Log uploaded to S3 as: ${logFileName}`);


      // Post results to log server
      try {
        console.log(`  Posting results to log server...`);
        await postResultsToLogServer({
          url: url.url,
          curl_command : process.env.curl_command.replace('URL_GOES_HERE', url.url) || "N/A",
          location: process.env.location || "N/A",
          machine_type: process.env.machine_type || "N/A",
          test_date: results.date,
          speed: results.speed,
          x_cache: results.xCache,
          x_served_by: results.xServedBy,
          s3_log_key: logFileName
        });
      } catch (error) {
        console.error(`  Failed to post results to log server: ${error}`);
      }




    } catch (error) {
      console.error(`  Failed to test ${url.url}:`, error.message);
    } finally {
      console.log('-----------------------------------\n');
    }
  }

  console.log('All tests finished.');
}

// --- Run the script ---
runAllTests();