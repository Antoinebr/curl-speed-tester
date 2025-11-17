import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { URL } from 'url';
import path from 'path'; // Using path for cross-platform file saving
import { url } from 'inspector';
import { uploadToS3 } from  './s3_uploader.js';
import { postResultsToLogServer } from './log_server.js';
import {readFileSync} from "fs";
import { runParallelTest } from './parallelTesting.js';
import { executeCurl } from './singleTesting.js';
import { parseHeader,createLogFileName } from './utils.js';
// --- Configuration ---

const LOG_DIRECTORY = './curl_logs'; // Directory to store log files

const URLS_TO_TEST = readFileSync('urlsToTest.txt', 'utf-8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(url => ({ url: url.trim() }));


const URLS_TO_PARALLEL_TEST = readFileSync('urlsToParalleTest.txt', 'utf-8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(url => ({ url: url.trim() }));
  



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


  if(URLS_TO_PARALLEL_TEST.length !== 0){  
        // Run a parallel test for the first URL in the parallel test list
    for (const url of URLS_TO_PARALLEL_TEST) {
      console.log(`--- Testing ${url.url} with PARALLEL throughput test ---`);
      try {
        await runParallelTest(url.url, 32);
      } catch (error) {
        console.error(`  Failed to run parallel test for ${url.url}:`, error.message);
      } finally {
        console.log('-----------------------------------\n');
      }
    }
  }


  if(URLS_TO_TEST.length !== 0){ 
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
          await postResultsToLogServer('/tests', {
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
  }

  console.log('All tests finished.');
}

//  Run the script
runAllTests();