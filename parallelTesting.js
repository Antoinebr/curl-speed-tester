import { spawn } from 'child_process';
import { postResultsToLogServer } from './log_server.js';

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

        // --- Post this aggregate result to your server ---
        // We adapt the data object for this new test type
        console.log(`  Posting aggregate results to log server...`);
        await postResultsToLogServer('/parallel_tests', {
            url: url,
            description: `parallel_test (${numConnections} connections)`, // Custom command
            location: process.env.location || "N/A",
            machine_type: process.env.machine_type || "N/A",
            test_date: new Date().toISOString(), // Use current time
            speed: throughput_gbps.toFixed(2) // We store the Gbps value in the 'speed' field
        });

    } catch (error) {
        console.error(`  Failed to run parallel test for ${url}:`, error.message);
    } finally {
        console.log('-----------------------------------\n');
    }
}



