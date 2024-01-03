# Greengrass CDK Project

This project provides an AWS Cloud Development Kit (CDK) setup for deploying a Greengrass V2 infrastructure, including necessary components like AWS IoT Thing Group, Greengrass roles, Lambda functions, and a CI/CD pipeline using AWS CodePipeline and CodeBuild.

![Alt text](/infra.png)
## Overview

The CDK stack includes the following resources:

- S3 Bucket for Greengrass components
- IoT Thing Group for Greengrass
- IAM Roles for Greengrass and Lambda functions
- Lambda functions for component updates and initialization
- CodePipeline for CI/CD workflows
- CodeBuild project for building and deploying resources



## Prerequisites

- AWS CLI: Make sure you have the AWS CLI installed and configured with the appropriate credentials and region.
- Node.js: This project requires Node.js. Install it from [nodejs.org](https://nodejs.org/).
- AWS CDK: Install the AWS CDK toolkit globally using npm: `npm install -g aws-cdk`.
- dotenv: Ensure `dotenv` is installed for managing environment variables.

## Setup

1. **Store GitHub Credentials in AWS Secrets Manager**:
   Before deploying the stack, store your GitHub token in AWS Secrets Manager. This token is used by AWS CodePipeline to access your GitHub repository.

   ```bash
   aws secretsmanager create-secret --name GITHUB_TOKEN --secret-string '{"GITHUB_TOKEN":"your_github_token_here"}'

2. **Clone the Repository**: Clone this repository to your local machine.

    ```bash
    git clone https://github.com/WirelessEco/laser-greengrass-v2
    cd laser-greengrass-v2
    ```
3. **Setup a separate components repo as defined here:** https://github.com/evantobin1/OTGtoS3

3. **Install Dependencies**: Install the necessary npm packages.

    ```bash
    npm install
    ```

4. **Environment Variables**: Create a `.env` file at the root of your project and define the necessary environment variables as outlined in the `.env.sample` file.

5. **Bootstrap CDK**: If this is your first time using CDK in your AWS account and region, you need to bootstrap CDK.

    ```bash
    cdk bootstrap
    ```

## Deployment

To deploy the stack to your AWS account, run:

```bash
npm run && cdk deploy