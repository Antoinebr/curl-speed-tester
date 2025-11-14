import {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand
} from "@aws-sdk/client-s3";

import {
    
    S3_BUCKET_NAME,
    S3_REGION,
    S3_ENDPOINT,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY
} from './config.js';

// Check if all required S3 config values are present.
const s3Configured = S3_BUCKET_NAME && S3_REGION && S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY;

let s3Client;

if (s3Configured) {
    s3Client = new S3Client({
        region: S3_REGION,
        endpoint: S3_ENDPOINT,
        credentials: {
            accessKeyId: S3_ACCESS_KEY_ID,
            secretAccessKey: S3_SECRET_ACCESS_KEY
        },
        forcePathStyle: true // Required for some S3-compatible services
    });
} else {
    console.warn("S3 client not initialized due to missing configuration.");
}

/**
 * Uploads raw log content (as a string) to S3.
 * @param {string} logContent - The full string content of the log.
 * @param {string} fileKey - The key (filename) to use in the S3 bucket.
 */
async function uploadToS3(logContent, fileKey) {
    if (!s3Client) {
        console.error("S3 upload skipped: S3 client is not configured.");
        return;
    }

    if (!logContent) {
        console.log(`No log content to upload for ${fileKey}`);
        return;
    }

    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: fileKey,
        Body: logContent, // Uploading the raw string
        ContentType: 'text/plain', // Set content type to plain text
    };

    try {
        const command = new PutObjectCommand(params);
        await s3Client.send(command);
        console.log(`  Successfully uploaded log to s3://${S3_BUCKET_NAME}/${fileKey}`);
    } catch (error) {
        console.error(`  Error uploading to S3: ${error}`);
        throw error; // Re-throw for the main script's catch block
    }
}

/**
 * Checks if a file exists in the S3 bucket.
 * @param {string} fileKey - The key (filename) to check.
 * @returns {Promise<boolean>}
 */
async function fileExistsInS3(fileKey) {
    if (!s3Client) {
        console.error("S3 check skipped: S3 client is not configured.");
        return false;
    }

    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: fileKey,
    };

    try {
        await s3Client.send(new HeadObjectCommand(params));
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        console.error(`Error checking file in S3: ${error}`);
        throw error;
    }
}

export {
    uploadToS3,
    fileExistsInS3
};