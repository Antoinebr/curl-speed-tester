import {
    spawn
} from 'child_process';
import {
    postResultsToLogServer
} from './log_server.js';
import {
    parseHeader
} from "./utils.js";

/**
 * Executes a single curl command optimized for parallel stats.
 * It resolves with { bytes, time }
 */
function executeCurlForParallelStats(url) {
    return new Promise((resolve, reject) => {


        // We get size_download and time_total, separated by a colon.
        // -s (silent) is added to suppress progress, we only want the final output.
        const curlArgs = [
            '-w', '%{size_download}:%{time_total}\n',
            '-o', '/dev/null',
            '-s', // Silent mode
            url
        ];

        let statsOutput = '';
        let errorLog = '';
        const curl = spawn('curl', curlArgs);

        // Capture the stats (e.g., "10000000000:10.53") from stdout
        curl.stdout.on('data', (data) => {
            statsOutput += data.toString();
        });

        // Capture any errors from stderr
        curl.stderr.on('data', (data) => {
            errorLog += data.toString();
        });

        // Handle process error
        curl.on('error', (err) => {
            reject(err);
        });

        // When the process finishes
        curl.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`curl process exited with code ${code}.\nLog:\n${errorLog}`));
                return;
            }

            try {
                // Parse the "bytes:time" output
                const [bytes, time] = statsOutput.trim().split(':');
                resolve({
                    bytes: parseFloat(bytes),
                    time: parseFloat(time)
                });
            } catch (e) {
                reject(new Error(`Failed to parse curl stats: ${statsOutput}`));
            }
        });
    });
}


/**
 * Executes the curl command for a single URL HEAD request to see  which pop it hits.
 * @param {string} url - The URL to test.
 * @returns {Promise<object>} - A promise that resolves with the test results.
 */
function executeCurlHead(url) {
    return new Promise((resolve, reject) => {

        // Arguments for curl HEAD request
        const curlArgs = [
            '-I', // HEAD request
            url,
            '-v' // Verbose output to stderr
        ];

        let fullLog = ''; // We will capture *all* output here

        // Spawn the curl process
        const curl = spawn('curl', curlArgs);

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
                xServedBy: '',
                xCache: '',
                date: ''
            };

            const lines = fullLog.split('\n');
            for (const line of lines) {
                const header = parseHeader(line);
                if (header) {
                    results[header.key] = header.value;
                }
            }

            resolve({
                results
            });
        });
    });
}


/**
 * Runs a parallel throughput test.
 * @param {string} url - The URL to test.
 * @param {number} numConnections - Number of parallel connections (e.g., 32).
 */
export async function runParallelTest(url, numConnections = 32) {
    console.log(`--- Starting PARALLEL throughput test for ${url} (${numConnections} connections) ---`);

    // Create an array of promises
    const promises = [];
    for (let i = 0; i < numConnections; i++) {
        promises.push(executeCurlForParallelStats(url));
    }

    try {
        // Wait for ALL 32 curl commands to finish


        // Example of allResults:        // [
        //   { bytes: 1390017, time: 0.117722 },
        //   { bytes: 1390017, time: 0.114583 },
        //   { bytes: 1390017, time: 0.397259 },
        //   { bytes: 1390017, time: 0.441065 },
        //   { bytes: 1390017, time: 0.240306 },
        //   { bytes: 1390017, time: 0.325351 },
        //   { bytes: 1390017, time: 0.411385 },
        //   { bytes: 1390017, time: 0.103668 },
        //   { bytes: 1390017, time: 0.350297 },
        //   { bytes: 1390017, time: 0.307825 },
        //   { bytes: 1390017, time: 0.310147 },
        //   { bytes: 1390017, time: 0.216704 },
        //   { bytes: 1390017, time: 0.560536 },
        //   { bytes: 1390017, time: 0.326996 },
        //   { bytes: 1390017, time: 0.312245 },
        //   { bytes: 1390017, time: 0.330499 },
        //   { bytes: 1390017, time: 0.404883 },
        //   { bytes: 1390017, time: 0.312347 },
        //   { bytes: 1390017, time: 0.340271 },
        //   { bytes: 1390017, time: 0.318742 },
        //   { bytes: 1390017, time: 0.344626 },
        //   { bytes: 1390017, time: 0.310839 },
        //   { bytes: 1390017, time: 0.350576 },
        //   { bytes: 1390017, time: 0.308157 },
        //   { bytes: 1390017, time: 0.313467 },
        //   { bytes: 1390017, time: 0.303462 },
        //   { bytes: 1390017, time: 0.333498 },
        //   { bytes: 1390017, time: 0.30791 },
        //   { bytes: 1390017, time: 0.245403 },
        //   { bytes: 1390017, time: 0.365188 },
        //   { bytes: 1390017, time: 0.34834 },
        //   { bytes: 1390017, time: 0.363915 }
        // ]
        const allResults = await Promise.all(promises);

    
        // --- Aggregation Logic ---
        let totalBytes = 0;
        let maxTime = 0;

        for (const result of allResults) {
            totalBytes += result.bytes;
            if (result.time > maxTime) {
                maxTime = result.time; // Find the time of the *slowest* download
            }
        }

        if (maxTime === 0 || totalBytes === 0) {
            console.error('  Test failed: Total bytes or max time was zero.');
            return;
        }

        // Calculate throughput
        const throughput_bps = (totalBytes * 8) / maxTime;
        const throughput_gbps = throughput_bps / 1_000_000_000;

        console.log(`  Total Bytes Downloaded: ${(totalBytes / 1_000_000_000).toFixed(2)} GB`);
        console.log(`  Total Test Time (Max): ${maxTime.toFixed(4)} s`);
        console.log(`  AGGREGATE THROUGHPUT: ${throughput_gbps.toFixed(2)} Gbps`);


        const headResults = await executeCurlHead(url);

        console.log(headResults.results);


        console.log(`  Posting aggregate results to log server...`);
        await postResultsToLogServer('/parallel_tests', {
            url: url,
            description: `parallel_test (${numConnections} connections)`, // Custom command
            location: process.env.location || "N/A",
            machine_type: process.env.machine_type || "N/A",
            test_date: new Date().toISOString(), // Use current time
            speed: throughput_gbps.toFixed(2), // We store the Gbps value in the 'speed' field
            x_cache: headResults.results.xCache || 'N/A',
            x_served_by: headResults.results.xServedBy || 'N/A'
        });

    } catch (error) {
        console.error(`  Failed to run parallel test for ${url}:`, error.message);
    } finally {
        console.log('-----------------------------------\n');
    }
}