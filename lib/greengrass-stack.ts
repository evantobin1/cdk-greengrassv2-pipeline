import * as cdk from "aws-cdk-lib";
import {
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_iam as iam,
  aws_iot as iot,
  custom_resources as cr,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as cpactions,
  aws_codebuild as codebuild,
} from "aws-cdk-lib";

export class GreengrassCdkProjectStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a single S3 bucket for all components
    const componentsBucket = new s3.Bucket(this, "ComponentsBucket", {
      versioned: true, // If you want versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Greengrass Thing Group
    const thingGroup = new iot.CfnThingGroup(this, "ThingGroup", {
      thingGroupName: "MyGreengrassThingGroup",
    });

    // TODO add thing type

    // IAM Role for Greengrass
    const greengrassRole = new iam.Role(this, "GreengrassRole", {
      assumedBy: new iam.ServicePrincipal("greengrass.amazonaws.com"),
    });

    greengrassRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [componentsBucket.bucketArn + "/*"],
      })
    );

    // IAM role for Lambda functions with CloudWatch logs permissions
    const lambdaRole = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Add Greengrass V2 permissions to the role
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "greengrass:*", // Broad permission for all Greengrass actions; you might want to narrow this down
        ],
        resources: ["*"], // You might want to restrict this to specific resources
      })
    );
    // Add Greengrass V2 permissions to the role
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:*", // Broad permission for all Greengrass actions; you might want to narrow this down
        ],
        resources: ["*"], // You might want to restrict this to specific resources
      })
    );

    // Lambda function for initializing the Greengrass components.
    // This will trigger the initialization stage of the Code Pipeline
    // that will zip up the contents, create the directories within the
    // bucket, and create the components.
    const initializeComponentsLambda = new lambda.Function(
      this,
      "InitializeComponentLambda",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "handler.handler",
        code: lambda.Code.fromAsset("./resources/lambda/initializeComponents"),
        role: lambdaRole,
        environment: {},
      }
    );

    // Lambda function for updating the Greengrass component
    const updateComponentLambda = new lambda.Function(
      this,
      "UpdateComponentLambda",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "handler.handler",
        code: lambda.Code.fromAsset("./resources/lambda/updateComponent"),
        role: lambdaRole,
        environment: {},
      }
    );

    // Define the IAM role for CodeBuild
    const codeBuildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      // ... other role properties ...
    });

    // Add S3 permissions to the role
    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
        resources: [
          "arn:aws:s3:::greengrassstack-componentsbucket322c7052-vjazwaknja08/*",
        ],
        // Replace with the ARN of your specific S3 bucket
      })
    );

    // Add Lambda invoke permissions to the role
    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [updateComponentLambda.functionArn],
      })
    );

    const buildProject = new codebuild.PipelineProject(this, "BuildProject", {
      environmentVariables: {
        BUCKET_NAME: { value: componentsBucket.bucketName },
        UPDATE_LAMBDA_FUNCTION_NAME: {
          value: updateComponentLambda.functionName,
        },
      },
      role: codeBuildRole,
    });

    // Define the source artifact and the build artifact
    const sourceArtifact = new codepipeline.Artifact();
    const buildArtifact = new codepipeline.Artifact();

    // Define the pipeline
    const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
      stages: [
        {
          stageName: "Source",
          actions: [
            new cpactions.GitHubSourceAction({
              actionName: "GitHub_Source",
              owner: "evantobin1",
              repo: "OTGtoS3",
              oauthToken: cdk.SecretValue.secretsManager("GITHUB_TOKEN", {
                jsonField: "GITHUB_TOKEN", // This should match the key in your secret
              }),
              output: sourceArtifact,
              branch: "main", // Your target branch
            }),
          ],
        },
        {
          stageName: "Build",
          actions: [
            new cpactions.CodeBuildAction({
              actionName: "BuildAction",
              project: buildProject,
              input: sourceArtifact,
              outputs: [buildArtifact],
            }),
          ],
        },
      ],
    });

    // Adding policy to allow Lambda to start CodePipeline execution
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["codepipeline:StartPipelineExecution"],
        resources: ["*"],
      })
    );

    // Custom resource to trigger the initialization Lambda function
    const initializeComponentsCustomResource = new cr.AwsCustomResource(
      this,
      "InitializeComponentsCustomResource",
      {
        onCreate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: initializeComponentsLambda.functionName,
            // Correctly pass the payload using the 'Payload' key
            Payload: JSON.stringify({
              pipelineName: pipeline.pipelineName,
              componentsBucket: componentsBucket.bucketName,
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()), // Ensure idempotency
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: [initializeComponentsLambda.functionArn],
          }),
        ]),
      }
    );
  }
}
