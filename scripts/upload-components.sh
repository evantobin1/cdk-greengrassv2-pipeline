#!/bin/bash

COMPONENT_NAME="OTGtoS3"
S3_BUCKET="OTGtoS3-Component"

# Function to check if S3 bucket exists
check_bucket_exists() {
  aws s3 ls "s3://$1" 2>&1 | grep -q 'NoSuchBucket'
  if [ $? -eq 0 ]; then
    echo "Bucket does not exist"
    return 1
  else
    echo "Bucket exists"
    return 0
  fi
}

# Create the S3 bucket if it doesn't exist
if ! check_bucket_exists "$S3_BUCKET"; then
  echo "Creating bucket: $S3_BUCKET"
  aws s3 mb "s3://$S3_BUCKET"
fi

# Navigate to the component directory
cd "resources/greengrass/$COMPONENT_NAME" || exit

# Zip the component files
zip -r "$COMPONENT_NAME.zip" .

# Upload the zip file to S3
aws s3 cp "$COMPONENT_NAME.zip" "s3://$S3_BUCKET/$COMPONENT_NAME/"

# Clean up local zip file
rm "$COMPONENT_NAME.zip"