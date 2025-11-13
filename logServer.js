import axios from 'axios';
// The API endpoint of your server
const LOG_SERVER_ENDPOINT = 'http://localhost:3000/tests';

/**
 * Posts the test results to the log server using Axios.
 * * @param {object} data - The data object to send to the server.
 * Expected format: { url, test_date, speed, x_cache, x_served_by, s3_log_key }
 */
async function postResultsToLogServer(data) {
  try {
    // Make the POST request
    const response = await axios.post(LOG_SERVER_ENDPOINT, data, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Log success on the client side
    console.log(`  Result saved to log server (ID: ${response.data.id})`);

  } catch (error) {
    // --- Detailed Axios Error Handling ---
    if (error.response) {
      // The request was made and the server responded with a non-2xx status code
      console.error(`  Failed to post results: Server responded with ${error.response.status}`);
      console.error(`  Response data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // The request was made but no response was received (e.g., server is down)
      console.error(`  Failed to post results: No response from server at ${LOG_SERVER_ENDPOINT}`);
    } else {
      // Something else happened in setting up the request
      console.error(`  Failed to post results: ${error.message}`);
    }
  }
}

export { postResultsToLogServer };