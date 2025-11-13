// This file centralizes S3 configuration.
// It pulls credentials from environment variables.

// Make sure to set these in your environment:
// export S3_BUCKET_NAME="your-bucket-name"
// export S3_REGION="your-region"
// export S3_ENDPOINT="https://your.s3.endpoint.com"
// export S3_ACCESS_KEY_ID="your-access-key"
// export S3_SECRET_ACCESS_KEY="your-secret-key"

import { config } from 'dotenv';

// Load environment variables from .env
config();

export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
export const S3_REGION = process.env.S3_REGION;
export const S3_ENDPOINT = process.env.S3_ENDPOINT;
export const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
export const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

// Basic check to ensure essential vars are set
if (!S3_BUCKET_NAME || !S3_REGION || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    console.warn(`
Warning: One or more S3 environment variables are not set.
(S3_BUCKET_NAME, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
S3 uploads will fail.
    `);
}